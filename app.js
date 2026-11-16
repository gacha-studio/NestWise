const palette = ["#7655a6", "#53649a", "#a3577e", "#976243", "#66549a", "#407d82", "#7c713b", "#985f8b", "#4f7894", "#836b50"];
const form = document.querySelector("#plannerForm");
const partsBody = document.querySelector("#partsBody");
const materialsBody = document.querySelector("#materialsBody");
const message = document.querySelector("#message");
const results = document.querySelector("#results");
const emptyResults = document.querySelector("#emptyResults");
let currentResult = null;
let currentBoardIndex = 0;
let nextPartId = 1;
let calculationToken = 0;
const draftStorageKey = "itadorityan.input.v1";
const settingInputNames = ["kerf", "edgeMargin"];
const optimizerTimeLimitMs = 180000;
let nextMaterialId = 1;

function saveInputDraft() {
  const draft = {
    version: 2,
    materials: [...materialsBody.rows].map((row) => ({
      width: row.querySelector('[name="boardWidth"]').value,
      height: row.querySelector('[name="boardHeight"]').value,
      count: row.querySelector('[name="boardCount"]').value,
    })),
    settings: Object.fromEntries(settingInputNames.map((name) => [name, form.elements.namedItem(name).value])),
    parts: [...partsBody.rows].map((row) => ({
      width: row.querySelector('[name="partWidth"]').value,
      height: row.querySelector('[name="partHeight"]').value,
      count: row.querySelector('[name="partCount"]').value,
    })),
  };
  try {
    localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    return true;
  } catch {
    message.textContent = "このブラウザーでは入力を保存できません。画面を閉じると入力が消える場合があります。";
    message.hidden = false;
    return false;
  }
}

function restoreInputDraft() {
  try {
    const raw = localStorage.getItem(draftStorageKey);
    if (!raw) return;
    let draft = JSON.parse(raw);
    if (draft.version === 1 && draft.board) {
      draft = {
        version: 2,
        materials: [{ width: draft.board.boardWidth, height: draft.board.boardHeight, count: draft.board.boardCount }],
        settings: { kerf: draft.board.kerf, edgeMargin: draft.board.edgeMargin },
        parts: draft.parts,
      };
    }
    if (draft.version !== 2 || !Array.isArray(draft.materials) || !draft.materials.length || !draft.settings || !Array.isArray(draft.parts) || !draft.parts.length) return;
    const safeValue = (value) => typeof value === "string" && /^\d*$/.test(value) ? value : "";
    for (const name of settingInputNames) form.elements.namedItem(name).value = safeValue(draft.settings[name]);
    materialsBody.replaceChildren();
    nextMaterialId = 1;
    for (const material of draft.materials) {
      if (!material || typeof material !== "object") return;
      addMaterialRow({ width: safeValue(material.width), height: safeValue(material.height), count: safeValue(material.count) });
    }
    partsBody.replaceChildren();
    nextPartId = 1;
    for (const part of draft.parts) {
      if (!part || typeof part !== "object") return;
      addPartRow({ width: safeValue(part.width), height: safeValue(part.height), count: safeValue(part.count) });
    }
  } catch {
    // 保存領域が使えない場合や保存データが壊れている場合は空の入力で開始する。
  }
}

function clearInputDraft() {
  try {
    localStorage.removeItem(draftStorageKey);
    return true;
  } catch {
    return false;
  }
}

function addMaterialRow(values = {}) {
  const id = nextMaterialId++;
  const row = document.createElement("tr");
  row.dataset.materialId = String(id);
  row.innerHTML = `
    <td><label class="sr-only" for="board-width-${id}">板幅 mm</label><input id="board-width-${id}" name="boardWidth" type="number" min="1" step="1" inputmode="numeric" required></td>
    <td><label class="sr-only" for="board-height-${id}">板高さ mm</label><input id="board-height-${id}" name="boardHeight" type="number" min="1" step="1" inputmode="numeric" required></td>
    <td><label class="sr-only" for="board-count-${id}">用意できる枚数</label><input id="board-count-${id}" name="boardCount" type="number" min="1" step="1" inputmode="numeric" required></td>
    <td><button class="remove-part" type="button" aria-label="この板材行を削除">×</button></td>`;
  row.querySelector('[name="boardWidth"]').value = values.width ?? "";
  row.querySelector('[name="boardHeight"]').value = values.height ?? "";
  row.querySelector('[name="boardCount"]').value = values.count ?? "";
  materialsBody.append(row);
}

function addPartRow(values = {}) {
  const id = nextPartId++;
  const row = document.createElement("tr");
  row.dataset.partId = String(id);
  row.innerHTML = `
    <td><label class="sr-only" for="part-width-${id}">部品の幅 mm</label><input id="part-width-${id}" name="partWidth" type="number" min="1" step="1" inputmode="numeric" required></td>
    <td><label class="sr-only" for="part-height-${id}">部品の高さ mm</label><input id="part-height-${id}" name="partHeight" type="number" min="1" step="1" inputmode="numeric" required></td>
    <td><label class="sr-only" for="part-count-${id}">部品の本数</label><input id="part-count-${id}" name="partCount" type="number" min="1" step="1" inputmode="numeric" required></td>
    <td><button class="remove-part" type="button" aria-label="この部品行を削除">×</button></td>`;
  row.querySelector('[name="partWidth"]').value = values.width ?? "";
  row.querySelector('[name="partHeight"]').value = values.height ?? "";
  row.querySelector('[name="partCount"]').value = values.count ?? "";
  partsBody.append(row);
}

function readInputs() {
  const materials = [...materialsBody.rows].map((row, index) => ({
    id: row.dataset.materialId,
    rowNumber: index + 1,
    width: Number(row.querySelector('[name="boardWidth"]').value),
    height: Number(row.querySelector('[name="boardHeight"]').value),
    count: Number(row.querySelector('[name="boardCount"]').value),
  }));
  const settings = Object.fromEntries(settingInputNames.map((name) => [name, Number(form.elements.namedItem(name).value)]));
  const parts = [...partsBody.rows].map((row, index) => ({
    id: row.dataset.partId,
    rowNumber: index + 1,
    width: Number(row.querySelector('[name="partWidth"]').value),
    height: Number(row.querySelector('[name="partHeight"]').value),
    count: Number(row.querySelector('[name="partCount"]').value),
  }));

  if (!materials.length || materials.some((board) => ![board.width, board.height, board.count].every(Number.isSafeInteger) || board.width <= 0 || board.height <= 0 || board.count <= 0)) {
    throw new Error("板材の幅・高さ・用意できる枚数を、すべて1以上の整数で入力してください。");
  }
  if (![settings.kerf, settings.edgeMargin].every(Number.isSafeInteger) || settings.kerf < 0 || settings.edgeMargin < 0) {
    throw new Error("ノコ刃と板端余白は0以上の整数で入力してください。");
  }
  if (materials.some((board) => settings.edgeMargin >= board.width || settings.edgeMargin >= board.height)) {
    throw new Error("板端余白は各板材の幅・高さより小さい値にしてください。");
  }
  if (!parts.length || parts.some((part) => ![part.width, part.height, part.count].every(Number.isSafeInteger) || part.width <= 0 || part.height <= 0 || part.count <= 0)) {
    throw new Error("部品の幅・高さ・本数をすべて1以上の整数で入力してください。");
  }

  const groupedMaterials = new Map();
  for (const board of materials) {
    const key = `${board.width}x${board.height}`;
    const existing = groupedMaterials.get(key);
    if (existing) existing.count += board.count;
    else groupedMaterials.set(key, { ...board });
  }
  return { materials: [...groupedMaterials.values()], settings, parts };
}
function expandAndSort(parts) {
  const expanded = [];
  for (const part of parts) {
    for (let copy = 0; copy < part.count; copy += 1) {
      expanded.push({ width: part.width, height: part.height, sourceId: part.id, rowNumber: part.rowNumber, placed: false, uid: expanded.length });
    }
  }
  return expanded.sort((a, b) =>
    Math.max(b.width, b.height) - Math.max(a.width, a.height) ||
    b.width * b.height - a.width * a.height
  );
}
function candidateCoordinates(board, placements) {
  const xs = [0];
  const ys = [0];
  for (const part of placements) {
    const x = part.x + part.width + board.kerf;
    const y = part.y + part.height + board.kerf;
    if (x < board.width - board.edgeMargin) xs.push(x);
    if (y < board.height - board.edgeMargin) ys.push(y);
  }
  return { xs, ys };
}

function rectanglesOverlap(a, b, kerf) {
  if (a.x + a.width + kerf <= b.x) return false;
  if (b.x + b.width + kerf <= a.x) return false;
  if (a.y + a.height + kerf <= b.y) return false;
  if (b.y + b.height + kerf <= a.y) return false;
  return true;
}

function fitsAt(board, candidate, placements) {
  if (candidate.x + candidate.width > board.width - board.edgeMargin) return false;
  if (candidate.y + candidate.height > board.height - board.edgeMargin) return false;
  return placements.every((placed) => !rectanglesOverlap(candidate, placed, board.kerf));
}

function canPlaceAfter(board, placements, virtual, part, deadline) {
  const withVirtual = [...placements, virtual];
  const { xs, ys } = candidateCoordinates(board, withVirtual);
  const orientations = [{ width: part.width, height: part.height }];
  if (part.width !== part.height) orientations.push({ width: part.height, height: part.width });
  for (const orientation of orientations) {
    for (const x of xs) {
      for (const y of ys) {
        if (performance.now() >= deadline) return false;
        if (fitsAt(board, { ...orientation, x, y }, withVirtual)) return true;
      }
    }
  }
  return false;
}

function lookAheadArea(board, items, chosenIndex, placements, candidate, deadline) {
  let area = 0;
  for (let i = 0; i < items.length; i += 1) {
    if (performance.now() >= deadline) break;
    if (!items[i].placed && i !== chosenIndex && canPlaceAfter(board, placements, candidate, items[i], deadline)) {
      area += items[i].width * items[i].height;
    }
  }
  return area;
}

function usedBoundsArea(placements, candidate) {
  let right = candidate.x + candidate.width;
  let bottom = candidate.y + candidate.height;
  for (const part of placements) {
    right = Math.max(right, part.x + part.width);
    bottom = Math.max(bottom, part.y + part.height);
  }
  return right * bottom;
}

function findBestPlacement(board, items, placements, deadline) {
  const { xs, ys } = candidateCoordinates(board, placements);
  let best = null;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].placed) continue;
    const part = items[i];
    const orientations = [{ width: part.width, height: part.height, rotated: false }];
    if (part.width !== part.height) orientations.push({ width: part.height, height: part.width, rotated: true });
    for (const orientation of orientations) {
      for (const x of xs) {
        for (const y of ys) {
          if (performance.now() >= deadline) return best;
          const candidate = { ...orientation, x, y, sourceId: part.sourceId, rowNumber: part.rowNumber, itemIndex: i };
          if (!fitsAt(board, candidate, placements)) continue;
          const area = part.width * part.height;
          const score = lookAheadArea(board, items, i, placements, candidate, deadline);
          const bounds = usedBoundsArea(placements, candidate);
          if (!best || area > best.area ||
            (area === best.area && score > best.score) ||
            (area === best.area && score === best.score && bounds < best.bounds) ||
            (area === best.area && score === best.score && bounds === best.bounds && y < best.y) ||
            (area === best.area && score === best.score && bounds === best.bounds && y === best.y && x < best.x)) {
            best = { ...candidate, area, score, bounds };
          }
        }
      }
    }
  }
  return best;
}

function packOneBoard(material, settings, remainingItems, deadline) {
  const board = { ...material, ...settings };
  const items = remainingItems.map((item) => ({ ...item, placed: false }));
  const placements = [];
  while (performance.now() < deadline) {
    const best = findBestPlacement(board, items, placements, deadline);
    if (!best) break;
    placements.push(best);
    items[best.itemIndex].placed = true;
  }
  if (!placements.length) return null;
  const remaining = items.filter((item) => !item.placed).map(({ placed, ...item }) => item);
  return {
    remaining,
    sheet: { material: { ...material }, placements },
    placedArea: placements.reduce((area, part) => area + part.width * part.height, 0),
    placedCount: placements.length,
  };
}

function searchStateKey(state) {
  const counts = new Map();
  for (const part of state.remaining) {
    const key = `${part.width}x${part.height}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return `${state.stockCounts.join(",")}|${[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([size, count]) => `${size}:${count}`).join(",")}`;
}

function isBetterSearchState(candidate, current) {
  if (candidate.placedCount !== current.placedCount) return candidate.placedCount > current.placedCount;
  if (candidate.placedArea !== current.placedArea) return candidate.placedArea > current.placedArea;
  const candidateRate = candidate.materialArea ? candidate.placedArea / candidate.materialArea : 0;
  const currentRate = current.materialArea ? current.placedArea / current.materialArea : 0;
  if (candidateRate !== currentRate) return candidateRate > currentRate;
  if (candidate.materialArea !== current.materialArea) return candidate.materialArea < current.materialArea;
  return candidate.boards.length < current.boards.length;
}

async function calculate(materials, parts, settings) {
  const startedAt = performance.now();
  const deadline = startedAt + optimizerTimeLimitMs;
  const items = expandAndSort(parts);
  const initial = {
    remaining: items,
    stockCounts: materials.map((material) => material.count),
    boards: [],
    placedArea: 0,
    placedCount: 0,
    materialArea: 0,
  };
  let best = initial;
  const stack = [initial];
  const visited = new Set();
  let expandedStates = 0;

  while (stack.length && performance.now() < deadline) {
    const state = stack.pop();
    const key = searchStateKey(state);
    if (visited.has(key)) continue;
    visited.add(key);
    if (isBetterSearchState(state, best)) best = state;
    if (!state.remaining.length) continue;

    const children = [];
    for (let materialIndex = 0; materialIndex < materials.length; materialIndex += 1) {
      if (state.stockCounts[materialIndex] <= 0 || performance.now() >= deadline) break;
      const packed = packOneBoard(materials[materialIndex], settings, state.remaining, deadline);
      if (!packed) continue;
      const stockCounts = [...state.stockCounts];
      stockCounts[materialIndex] -= 1;
      const material = materials[materialIndex];
      const child = {
        remaining: packed.remaining,
        stockCounts,
        boards: [...state.boards, { number: state.boards.length + 1, materialIndex, material: packed.sheet.material, placements: packed.sheet.placements }],
        placedArea: state.placedArea + packed.placedArea,
        placedCount: state.placedCount + packed.placedCount,
        materialArea: state.materialArea + material.width * material.height,
      };
      if (isBetterSearchState(child, best)) best = child;
      children.push(child);
    }
    children.sort((a, b) => isBetterSearchState(a, b) ? -1 : isBetterSearchState(b, a) ? 1 : 0);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    expandedStates += 1;
    if (expandedStates % 2 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const unplaced = new Map();
  for (const item of best.remaining) {
    const key = `${item.width}x${item.height}`;
    const current = unplaced.get(key) ?? { width: item.width, height: item.height, count: 0 };
    current.count += 1;
    unplaced.set(key, current);
  }
  const totalArea = parts.reduce((total, part) => total + part.width * part.height * part.count, 0);
  return {
    materials,
    settings,
    boards: best.boards,
    unplaced: [...unplaced.values()],
    totalArea,
    placedArea: best.placedArea,
    materialArea: best.materialArea,
    availableBoardCount: materials.reduce((total, material) => total + material.count, 0),
    utilization: best.materialArea > 0 ? best.placedArea / best.materialArea * 100 : 0,
    searchTimedOut: performance.now() >= deadline,
    searchElapsedMs: Math.round(performance.now() - startedAt),
  };
}
function edgeRemains(board, placements) {
  let topUsed = 0;
  let bottomUsed = 0;
  let leftUsed = 0;
  let rightUsed = 0;
  for (const part of placements) {
    if (part.y === 0) topUsed = Math.max(topUsed, part.x + part.width);
    if (part.y + part.height === board.height) bottomUsed = Math.max(bottomUsed, part.x + part.width);
    if (part.x === 0) leftUsed = Math.max(leftUsed, part.y + part.height);
    if (part.x + part.width === board.width) rightUsed = Math.max(rightUsed, part.y + part.height);
  }
  return { top: board.width - topUsed, bottom: board.width - bottomUsed, left: board.height - leftUsed, right: board.height - rightUsed };
}

const format = (value) => new Intl.NumberFormat("ja-JP").format(value);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function renderSummary(result) {
  const cards = [
    ["材料の使用枚数", result.boards.length, "枚", `用意した板 ${result.availableBoardCount} 枚`],
    ["使用率", result.utilization.toFixed(1), "%", "配置済み部品面積 ÷ 使用板面積"],
    ["部品総面積", format(result.totalArea), "mm²", "入力した部品すべて"],
    ["端材面積", format(result.materialArea - result.placedArea), "mm²", "使用板面積 − 配置済み部品面積"],
  ];
  document.querySelector("#summary").innerHTML = cards.map(([label, value, unit, sub]) => `<article class="summary-card"><p class="summary-label">${label}</p><p class="summary-value">${value}<span class="summary-unit">${unit}</span></p><p class="summary-sub">${sub}</p></article>`).join("");
  const panel = document.querySelector("#unplacedPanel");
  if (result.unplaced.length === 0) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `<h3>板に配置できなかった部品</h3><table><thead><tr><th>幅</th><th>高さ</th><th>個数</th></tr></thead><tbody>${result.unplaced.map((part) => `<tr><td>${format(part.width)} mm</td><td>${format(part.height)} mm</td><td>${format(part.count)} 本</td></tr>`).join("")}</tbody></table>`;
}

function renderBoard() {
  if (!currentResult || currentResult.boards.length === 0) return;
  const sheet = currentResult.boards[currentBoardIndex];
  const { width, height } = sheet.material;
  const { edgeMargin } = currentResult.settings;
  const svg = document.querySelector("#boardSvg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const parts = sheet.placements.map((part, index) => {
    const color = palette[index % palette.length];
    const fontSize = Math.max(9, Math.min(48, Math.min(width, height) * 0.032, Math.min(part.width, part.height) * 0.22));
    const leftInset = fontSize * 0.55;
    const labels = `<text x="${part.x + part.width / 2}" y="${part.y + fontSize * 1.35}" text-anchor="middle" fill="#ffffff" font-size="${fontSize}" font-weight="600">${format(part.width)}</text><text x="${part.x + leftInset}" y="${part.y + part.height / 2 + fontSize * 0.35}" text-anchor="start" fill="#ffffff" font-size="${fontSize}" font-weight="600">${format(part.height)}</text>`;
    return `<g class="rotatable-part" data-placement-index="${index}" role="button" tabindex="0" aria-label="${format(part.width)} × ${format(part.height)} mm の部品を90度回転"><title>タップまたはクリックで90度回転</title><rect x="${part.x}" y="${part.y}" width="${part.width}" height="${part.height}" fill="${color}" stroke="#ffffff" stroke-width="${Math.max(2, Math.min(width, height) * .003)}"/>${labels}</g>`;
  }).join("");
  const boundary = edgeMargin > 0 ? `<line x1="${width - edgeMargin}" y1="0" x2="${width - edgeMargin}" y2="${height}" stroke="#9b79bd" stroke-width="${Math.max(2, Math.min(width, height) * .002)}" stroke-dasharray="${Math.max(10, Math.min(width, height) * .018)} ${Math.max(7, Math.min(width, height) * .012)}"/><line x1="0" y1="${height - edgeMargin}" x2="${width}" y2="${height - edgeMargin}" stroke="#9b79bd" stroke-width="${Math.max(2, Math.min(width, height) * .002)}" stroke-dasharray="${Math.max(10, Math.min(width, height) * .018)} ${Math.max(7, Math.min(width, height) * .012)}"/>` : "";
  svg.innerHTML = `<title id="svgTitle">板 ${sheet.number} の切断図</title><desc id="svgDescription">${width} mm × ${height} mm の板に ${sheet.placements.length} 個の部品を配置</desc><rect x="0" y="0" width="${width}" height="${height}" rx="3" fill="#f0eaf8" stroke="#55486b" stroke-width="${Math.max(3, Math.min(width, height) * .004)}"/>${boundary}${parts}`;
  document.querySelector("#boardCounter").textContent = `板 ${sheet.number} / ${currentResult.boards.length}`;
  document.querySelector("#boardCaption").textContent = `${format(width)} × ${format(height)} mm　・　${sheet.placements.length} ピース`;
  const remains = edgeRemains(sheet.material, sheet.placements);
  const offcutArea = width * height - sheet.placements.reduce((area, part) => area + part.width * part.height, 0);
  document.querySelector("#boardFacts").innerHTML = [
    ["上辺の余り", `${format(remains.top)} mm`], ["下辺の余り", `${format(remains.bottom)} mm`],
    ["左辺の余り", `${format(remains.left)} mm`], ["右辺の余り", `${format(remains.right)} mm`],
    ["この板の端材面積", `${format(offcutArea)} mm²`],
  ].map(([label, value]) => `<div class="fact-row"><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  document.querySelector("#previousBoard").disabled = currentBoardIndex === 0;
  document.querySelector("#nextBoard").disabled = currentBoardIndex >= currentResult.boards.length - 1;
}

async function repackSheetAroundFixedPart(sheet, settings, fixedPart, fixedIndex) {
  const deadline = performance.now() + optimizerTimeLimitMs;
  const board = { ...sheet.material, ...settings };
  const items = sheet.placements
    .filter((_, index) => index !== fixedIndex)
    .map((part) => ({ ...part, placed: false }));
  const placements = [fixedPart];
  while (items.some((part) => !part.placed) && performance.now() < deadline) {
    const best = findBestPlacement(board, items, placements, deadline);
    if (!best) break;
    placements.push(best);
    items[best.itemIndex].placed = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { placements, complete: items.every((part) => part.placed) };
}

async function rotatePlacement(index) {
  if (!currentResult || document.querySelector("#boardSvg").getAttribute("aria-busy") === "true") return;
  const result = currentResult;
  const boardIndex = currentBoardIndex;
  const sheet = result.boards[boardIndex];
  const part = sheet?.placements[index];
  if (!part) return;
  const rotated = { ...part, width: part.height, height: part.width };
  const others = sheet.placements.filter((_, placementIndex) => placementIndex !== index);
  if (!fitsAt({ ...sheet.material, ...currentResult.settings }, rotated, others)) {
    message.textContent = "回転できません。板の外にはみ出すか、ほかの部品と重なります。";
    message.hidden = false;
    return;
  }
  const fixedPart = { ...rotated, rotated: !part.rotated };
  const baseline = sheet.placements.map((item, itemIndex) => itemIndex === index ? fixedPart : { ...item });
  const svg = document.querySelector("#boardSvg");
  const navigationButtons = [document.querySelector("#previousBoard"), document.querySelector("#nextBoard")];
  svg.setAttribute("aria-busy", "true");
  navigationButtons.forEach((button) => { button.disabled = true; });
  message.textContent = "部品を回転して、この板の部品を詰め直しています…";
  message.hidden = false;
  try {
    const packed = await repackSheetAroundFixedPart(sheet, result.settings, fixedPart, index);
    if (currentResult !== result || currentBoardIndex !== boardIndex) return;
    if (packed.complete) {
      sheet.placements = packed.placements;
      message.textContent = "部品を回転し、同じ板の中で詰め直しました。";
    } else {
      sheet.placements = baseline;
      message.textContent = "すべての部品を詰め直せなかったため、ほかの部品を動かさず回転だけ反映しました。";
    }
    message.hidden = false;
    renderBoard();
  } catch (error) {
    if (currentResult === result && currentBoardIndex === boardIndex) {
      sheet.placements = baseline;
      renderBoard();
      message.textContent = `詰め直しに失敗したため、回転だけ反映しました。${error.message}`;
      message.hidden = false;
    }
  } finally {
    svg.setAttribute("aria-busy", "false");
    navigationButtons[0].disabled = currentBoardIndex === 0;
    navigationButtons[1].disabled = !currentResult || currentBoardIndex >= currentResult.boards.length - 1;
  }
}

function showResults(result) {
  currentResult = result;
  currentBoardIndex = 0;
  renderSummary(result);
  const searchNote = document.querySelector("#searchNote");
  searchNote.textContent = result.searchTimedOut
    ? `時間上限に達しました。探索した候補の中で最も良かった配置を表示しています（${(result.searchElapsedMs / 1000).toFixed(1)}秒）。`
    : `探索候補を確認しました。全配置パターンの最適解を保証するものではありません（${(result.searchElapsedMs / 1000).toFixed(1)}秒）。`;
  searchNote.hidden = false;
  if (result.boards.length === 0) {
    results.hidden = true;
    emptyResults.hidden = false;
    throw new Error("部品を1つも配置できませんでした。板寸法・設定・部品寸法を確認してください。");
  }
  results.hidden = false;
  emptyResults.hidden = true;
  renderBoard();
}

document.querySelector("#boardSvg").addEventListener("click", (event) => {
  const part = event.target.closest("[data-placement-index]");
  if (part) void rotatePlacement(Number(part.dataset.placementIndex));
});
document.querySelector("#boardSvg").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const part = event.target.closest("[data-placement-index]");
  if (!part) return;
  event.preventDefault();
  void rotatePlacement(Number(part.dataset.placementIndex));
});

function invalidateResults() {
  currentResult = null;
  results.hidden = true;
  emptyResults.hidden = false;
  document.querySelector("#searchNote").hidden = true;
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.hidden = true;
  let input;
  try {
    input = readInputs();
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
    return;
  }

  const token = ++calculationToken;
  message.textContent = "板材の組み合わせを探索しています（最大3分）…";
  message.hidden = false;
  form.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
  const newCalculationButton = document.querySelector("#newCalculation");
  newCalculationButton.disabled = true;
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const result = await calculate(input.materials, input.parts, input.settings);
    if (token !== calculationToken) return;
    showResults(result);
    message.hidden = true;
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    form.querySelectorAll("input, button").forEach((control) => { control.disabled = false; });
    newCalculationButton.disabled = false;
  }
});

form.addEventListener("input", (event) => {
  if (event.target.matches("input")) {
    invalidateResults();
    message.hidden = true;
    saveInputDraft();
  }
});

document.querySelector("#addMaterial").addEventListener("click", () => {
  addMaterialRow();
  invalidateResults();
  saveInputDraft();
  materialsBody.lastElementChild.querySelector("input").focus();
});
materialsBody.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-part");
  if (!button) return;
  if (materialsBody.rows.length === 1) {
    message.textContent = "板材は1行以上必要です。";
    message.hidden = false;
    return;
  }
  button.closest("tr").remove();
  invalidateResults();
  saveInputDraft();
});

document.querySelector("#addPart").addEventListener("click", () => {
  addPartRow();
  invalidateResults();
  saveInputDraft();
  partsBody.lastElementChild.querySelector("input").focus();
});
partsBody.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-part");
  if (!button) return;
  if (partsBody.rows.length === 1) {
    message.textContent = "部品行は1行以上必要です。";
    message.hidden = false;
    return;
  }
  button.closest("tr").remove();
  invalidateResults();
  saveInputDraft();
});

document.querySelector("#previousBoard").addEventListener("click", () => {
  if (currentBoardIndex > 0) { currentBoardIndex -= 1; renderBoard(); }
});
document.querySelector("#nextBoard").addEventListener("click", () => {
  if (currentResult && currentBoardIndex < currentResult.boards.length - 1) { currentBoardIndex += 1; renderBoard(); }
});
document.querySelector("#printBoard").addEventListener("click", () => window.print());
document.querySelector("#newCalculation").addEventListener("click", () => {
  const cleared = clearInputDraft();
  form.reset();
  materialsBody.replaceChildren();
  partsBody.replaceChildren();
  nextMaterialId = 1;
  nextPartId = 1;
  addMaterialRow();
  addPartRow();
  calculationToken += 1;
  invalidateResults();
  message.hidden = cleared;
  if (!cleared) message.textContent = "保存データを消去できませんでした。ブラウザーの保存設定を確認してください。";
  document.querySelector('[name="boardWidth"]').focus();
});

addMaterialRow();
addPartRow();
restoreInputDraft();





