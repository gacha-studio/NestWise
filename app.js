const palette = ["#297a5d", "#4777a8", "#ba7139", "#8863a8", "#bd5f57", "#368c8b", "#798a3c", "#bc668c", "#5684a2", "#9b7741"];
const form = document.querySelector("#plannerForm");
const partsBody = document.querySelector("#partsBody");
const message = document.querySelector("#message");
const results = document.querySelector("#results");
const emptyResults = document.querySelector("#emptyResults");
let currentResult = null;
let currentBoardIndex = 0;
let nextPartId = 1;

function addPartRow(values = {}) {
  const id = nextPartId++;
  const row = document.createElement("tr");
  row.dataset.partId = String(id);
  row.innerHTML = `
    <td><label class="sr-only" for="part-width-${id}">部品の幅 mm</label><input id="part-width-${id}" name="partWidth" type="number" min="1" step="1" inputmode="numeric" value="${values.width ?? ""}" required></td>
    <td><label class="sr-only" for="part-height-${id}">部品の高さ mm</label><input id="part-height-${id}" name="partHeight" type="number" min="1" step="1" inputmode="numeric" value="${values.height ?? ""}" required></td>
    <td><label class="sr-only" for="part-count-${id}">部品の本数</label><input id="part-count-${id}" name="partCount" type="number" min="1" step="1" inputmode="numeric" value="${values.count ?? ""}" required></td>
    <td><button class="remove-part" type="button" aria-label="この部品行を削除">×</button></td>`;
  partsBody.append(row);
}

function readInputs() {
  const values = new FormData(form);
  const number = (name) => Number(values.get(name));
  const board = {
    width: number("boardWidth"),
    height: number("boardHeight"),
    count: number("boardCount"),
    kerf: number("kerf"),
    edgeMargin: number("edgeMargin"),
  };
  const parts = [...partsBody.rows].map((row, index) => ({
    id: row.dataset.partId,
    rowNumber: index + 1,
    width: Number(row.querySelector('[name="partWidth"]').value),
    height: Number(row.querySelector('[name="partHeight"]').value),
    count: Number(row.querySelector('[name="partCount"]').value),
  }));

  if (![board.width, board.height, board.count].every(Number.isSafeInteger) || board.width <= 0 || board.height <= 0 || board.count <= 0) {
    throw new Error("板幅・板高さ・用意できる枚数を1以上の整数で入力してください。");
  }
  if (![board.kerf, board.edgeMargin].every(Number.isSafeInteger) || board.kerf < 0 || board.edgeMargin < 0) {
    throw new Error("ノコ刃と板端余白は0以上の整数で入力してください。");
  }
  if (board.edgeMargin >= board.width || board.edgeMargin >= board.height) {
    throw new Error("板端余白は板幅・板高さより小さい値にしてください。");
  }
  if (parts.length === 0 || parts.some((part) => !Number.isSafeInteger(part.width) || !Number.isSafeInteger(part.height) || !Number.isSafeInteger(part.count) || part.width <= 0 || part.height <= 0 || part.count <= 0)) {
    throw new Error("部品の幅・高さ・本数をすべて1以上の整数で入力してください。");
  }
  return { board, parts };
}

function expandAndSort(parts) {
  const expanded = [];
  for (const part of parts) {
    for (let copy = 0; copy < part.count; copy += 1) {
      expanded.push({ width: part.width, height: part.height, sourceId: part.id, rowNumber: part.rowNumber, placed: false });
    }
  }
  // Module2の入れ替え順を保つ。最大辺の長い順、同じなら面積の大きい順。
  for (let i = 0; i < expanded.length - 1; i += 1) {
    for (let j = i + 1; j < expanded.length; j += 1) {
      const a = expanded[i];
      const b = expanded[j];
      const longestA = Math.max(a.width, a.height);
      const longestB = Math.max(b.width, b.height);
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      if (longestB > longestA || (longestB === longestA && areaB > areaA)) {
        expanded[i] = b;
        expanded[j] = a;
      }
    }
  }
  return expanded;
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

function canPlaceAfter(board, placements, virtual, part) {
  const withVirtual = [...placements, virtual];
  const { xs, ys } = candidateCoordinates(board, withVirtual);
  const orientations = [{ width: part.width, height: part.height }];
  if (part.width !== part.height) orientations.push({ width: part.height, height: part.width });
  for (const orientation of orientations) {
    for (const x of xs) {
      for (const y of ys) {
        if (fitsAt(board, { ...orientation, x, y }, withVirtual)) return true;
      }
    }
  }
  return false;
}

function lookAheadArea(board, items, chosenIndex, placements, candidate) {
  let area = 0;
  for (let i = 0; i < items.length; i += 1) {
    if (!items[i].placed && i !== chosenIndex && canPlaceAfter(board, placements, candidate, items[i])) {
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

function findBestPlacement(board, items, placements) {
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
          const candidate = { ...orientation, x, y, sourceId: part.sourceId, rowNumber: part.rowNumber, itemIndex: i };
          if (!fitsAt(board, candidate, placements)) continue;
          const area = part.width * part.height;
          const score = lookAheadArea(board, items, i, placements, candidate);
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

function calculate(board, parts) {
  const items = expandAndSort(parts);
  const boards = [];
  for (let sheetNumber = 1; sheetNumber <= board.count && items.some((item) => !item.placed); sheetNumber += 1) {
    const placements = [];
    while (true) {
      const best = findBestPlacement(board, items, placements);
      if (!best) break;
      placements.push(best);
      items[best.itemIndex].placed = true;
    }
    if (placements.length > 0) boards.push({ number: sheetNumber, placements });
  }
  const unplaced = new Map();
  for (const item of items) {
    if (!item.placed) {
      const key = `${item.width}x${item.height}`;
      const current = unplaced.get(key) ?? { width: item.width, height: item.height, count: 0 };
      current.count += 1;
      unplaced.set(key, current);
    }
  }
  const placedArea = boards.reduce((total, sheet) => total + sheet.placements.reduce((sum, part) => sum + part.width * part.height, 0), 0);
  const totalArea = parts.reduce((total, part) => total + part.width * part.height * part.count, 0);
  const materialArea = board.width * board.height * boards.length;
  return {
    board,
    boards,
    unplaced: [...unplaced.values()],
    totalArea,
    placedArea,
    materialArea,
    utilization: materialArea > 0 ? placedArea / materialArea * 100 : 0,
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
    ["材料の使用枚数", result.boards.length, "枚", `用意した板 ${result.board.count} 枚`],
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
  const { width, height, edgeMargin } = currentResult.board;
  const svg = document.querySelector("#boardSvg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const parts = sheet.placements.map((part, index) => {
    const color = palette[index % palette.length];
    const fontSize = Math.max(12, Math.min(width, height) * 0.032);
    const secondLine = part.rotated ? `<text x="${part.x + part.width / 2}" y="${part.y + part.height / 2 + fontSize * 1.3}" text-anchor="middle" fill="white" font-size="${fontSize * .68}">回転</text>` : "";
    return `<g><title>${format(part.width)} × ${format(part.height)} mm${part.rotated ? "（回転）" : ""}</title><rect x="${part.x}" y="${part.y}" width="${part.width}" height="${part.height}" fill="${color}" stroke="#ffffff" stroke-width="${Math.max(2, Math.min(width, height) * .003)}"/><text x="${part.x + part.width / 2}" y="${part.y + part.height / 2 + fontSize * .35}" text-anchor="middle" fill="#fff" font-size="${fontSize}" font-weight="700">${format(part.width)} × ${format(part.height)}</text>${secondLine}</g>`;
  }).join("");
  const boundary = edgeMargin > 0 ? `<line x1="${width - edgeMargin}" y1="0" x2="${width - edgeMargin}" y2="${height}" stroke="#a46f36" stroke-width="${Math.max(2, Math.min(width, height) * .002)}" stroke-dasharray="${Math.max(10, Math.min(width, height) * .018)} ${Math.max(7, Math.min(width, height) * .012)}"/><line x1="0" y1="${height - edgeMargin}" x2="${width}" y2="${height - edgeMargin}" stroke="#a46f36" stroke-width="${Math.max(2, Math.min(width, height) * .002)}" stroke-dasharray="${Math.max(10, Math.min(width, height) * .018)} ${Math.max(7, Math.min(width, height) * .012)}"/>` : "";
  svg.innerHTML = `<title id="svgTitle">板 ${sheet.number} の切断図</title><desc id="svgDescription">${width} mm × ${height} mm の板に ${sheet.placements.length} 個の部品を配置</desc><rect x="0" y="0" width="${width}" height="${height}" rx="3" fill="#e8eee8" stroke="#35463d" stroke-width="${Math.max(3, Math.min(width, height) * .004)}"/>${boundary}${parts}`;
  document.querySelector("#boardCounter").textContent = `板 ${sheet.number} / ${currentResult.boards.length}`;
  document.querySelector("#boardCaption").textContent = `${format(width)} × ${format(height)} mm　・　${sheet.placements.length} ピース`;
  const remains = edgeRemains(currentResult.board, sheet.placements);
  const offcutArea = width * height - sheet.placements.reduce((area, part) => area + part.width * part.height, 0);
  document.querySelector("#boardFacts").innerHTML = [
    ["上辺の余り", `${format(remains.top)} mm`], ["下辺の余り", `${format(remains.bottom)} mm`],
    ["左辺の余り", `${format(remains.left)} mm`], ["右辺の余り", `${format(remains.right)} mm`],
    ["この板の端材面積", `${format(offcutArea)} mm²`],
  ].map(([label, value]) => `<div class="fact-row"><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  document.querySelector("#previousBoard").disabled = currentBoardIndex === 0;
  document.querySelector("#nextBoard").disabled = currentBoardIndex >= currentResult.boards.length - 1;
}

function showResults(result) {
  currentResult = result;
  currentBoardIndex = 0;
  renderSummary(result);
  if (result.boards.length === 0) {
    results.hidden = true;
    emptyResults.hidden = false;
    throw new Error("部品を1つも配置できませんでした。板寸法・設定・部品寸法を確認してください。");
  }
  results.hidden = false;
  emptyResults.hidden = true;
  renderBoard();
}

function invalidateResults() {
  currentResult = null;
  results.hidden = true;
  emptyResults.hidden = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  message.hidden = true;
  try {
    const { board, parts } = readInputs();
    showResults(calculate(board, parts));
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  }
});

form.addEventListener("input", (event) => {
  if (event.target.matches("input")) {
    invalidateResults();
    message.hidden = true;
  }
});

document.querySelector("#addPart").addEventListener("click", () => {
  addPartRow();
  invalidateResults();
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
});

document.querySelector("#previousBoard").addEventListener("click", () => {
  if (currentBoardIndex > 0) { currentBoardIndex -= 1; renderBoard(); }
});
document.querySelector("#nextBoard").addEventListener("click", () => {
  if (currentResult && currentBoardIndex < currentResult.boards.length - 1) { currentBoardIndex += 1; renderBoard(); }
});
document.querySelector("#printBoard").addEventListener("click", () => window.print());
document.querySelector("#newCalculation").addEventListener("click", () => {
  form.reset();
  partsBody.innerHTML = "";
  nextPartId = 1;
  addPartRow();
  invalidateResults();
  message.hidden = true;
  document.querySelector('[name="boardWidth"]').focus();
});

addPartRow();