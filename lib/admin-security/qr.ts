import qrcode from "qrcode-generator";

/** QR-Code als SVG (für die Einrichtung in der Authenticator-App) – wird auf dem Server erzeugt */
export function qrSvg(text: string) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
