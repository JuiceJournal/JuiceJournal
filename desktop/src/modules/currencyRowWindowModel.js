// Which rows of a long price list the table holds: the ones near the screen. A spacer of the same height stands for
// the rest, so the page scrolls as if every row were there. Building and laying out all 500 rows costs a sort or a tab
// switch hundreds of milliseconds; about 20 of them are on screen.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.currencyRowWindowModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCurrencyRowWindowModel() {
  // A list this short costs little to draw whole.
  const FULL_LIST_MAX = 120;
  const OVERSCAN_ROWS = 20;
  // The window moves once the screen comes this close to its edge, so a scroll does not redraw on every frame.
  const REDRAW_MARGIN_ROWS = 5;

  // A row's top inside the list. The open detail row pushes down every row after it.
  function getRowTop(index, { rowHeight, detailIndex = -1, detailHeight = 0 }) {
    return index * rowHeight + (detailIndex >= 0 && index > detailIndex ? detailHeight : 0);
  }

  // The row at a height inside the list; inside the open detail, the row it belongs to.
  function getRowIndexAt(top, { count, rowHeight, detailIndex = -1, detailHeight = 0 }) {
    const detailTop = detailIndex >= 0 ? (detailIndex + 1) * rowHeight : Infinity;
    const offset = top < detailTop ? top : Math.max(top - detailHeight, detailTop - 1);
    return Math.min(Math.max(Math.floor(offset / rowHeight), 0), count - 1);
  }

  // `viewTop` and `viewHeight` place the screen on the list. The `current` window stays while the screen is well inside
  // it. `topHeight` and `bottomHeight` are what the two spacers stand for, the open detail included when it is outside.
  function selectRowWindow({ viewTop, viewHeight, current = null, ...layout }) {
    const { count, rowHeight, detailIndex = -1, detailHeight = 0 } = layout;
    const first = getRowIndexAt(viewTop, layout);
    const last = getRowIndexAt(viewTop + viewHeight, layout);
    const keep = current
      && (current.start === 0 || first - current.start >= REDRAW_MARGIN_ROWS)
      && (current.end === count || current.end - 1 - last >= REDRAW_MARGIN_ROWS);
    const start = keep ? current.start : Math.max(0, first - OVERSCAN_ROWS);
    const end = keep ? current.end : Math.min(count, last + OVERSCAN_ROWS + 1);
    return {
      start,
      end,
      topHeight: getRowTop(start, layout),
      bottomHeight: (count - end) * rowHeight + (detailIndex >= end ? detailHeight : 0)
    };
  }

  return {
    FULL_LIST_MAX,
    getRowTop,
    selectRowWindow
  };
});
