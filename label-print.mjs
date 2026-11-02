// Tekent de sticker-PDF als plaatjes voor label-print.html (zie daar).
import * as pdfjsLib from './node_modules/pdfjs-dist/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

// Gelijk aan de dpi in printLabelPdf (main.js): één beeldpixel = één printerpunt.
const DPI = 300;
// De DYMO print de linkerrand van het etiket niet (de eerste letter viel er
// half af): sticker iets kleiner tekenen en een stukje naar rechts. Kleiner
// tekenen (niet schalen) houdt één beeldpixel = één printerpunt, dus scherp.
const LABEL_SCALE = 0.97;
const SHIFT_RIGHT = '1.5mm';
// Een thermische printer kent alleen zwart en wit; grijze randjes (anti-aliasing)
// worden korrelig. Daarom alles boven deze helderheid wit, de rest zwart.
const THRESHOLD = 160;

function toBlackAndWhite(context, width, height) {
  const image = context.getImageData(0, 0, width, height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 < THRESHOLD ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

// base64 -> plaatjes in de pagina. Geeft de maat van de eerste pagina (in
// punten) terug, zodat main.js liggend of staand kan printen.
window.renderLabels = async (base64) => {
  const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const pdf = await pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    standardFontDataUrl: new URL('./node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href
  }).promise;
  document.body.replaceChildren();
  let first = null;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const size = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (DPI / 72) * LABEL_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    toBlackAndWhite(context, canvas.width, canvas.height);
    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    await img.decode();
    // Op de getekende maat (in punten), niet passend geschaald; het dubbele
    // van SHIFT_RIGHT als linkermarge schuift hem binnen het centreren op.
    img.style.width = `${size.width * LABEL_SCALE}pt`;
    img.style.height = `${size.height * LABEL_SCALE}pt`;
    img.style.marginLeft = `calc(2 * ${SHIFT_RIGHT})`;
    const label = document.createElement('div');
    label.className = 'label';
    label.appendChild(img);
    document.body.appendChild(label);
    first = first || { width: size.width, height: size.height };
  }
  return { pages: pdf.numPages, ...first };
};

window.labelPrintReady = true;
