// Browser downloads for our own SVG templates (S5b PR 6). The SVG is drawn by
// our code (design-svg.ts); a PNG is the same SVG painted onto a canvas.

function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(name: string, svg: string) {
  save(name, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

/** Paints the SVG at its own size onto a white canvas and saves it as PNG. */
export function downloadPng(name: string, svg: string): Promise<void> {
  const w = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1080);
  const h = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 1080);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? (save(name, b), resolve()) : reject(new Error("no image"))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image failed"));
    };
    img.src = url;
  });
}
