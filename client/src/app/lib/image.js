// Las imágenes se guardan como data URL en la base, así que conviene achicarlas
// antes de subirlas: una foto de celular sin tocar son varios MB y no entra en
// los límites que valida el server.

const MAX_SIDE = 900; // px del lado más largo
const QUALITY = 0.75;

const readAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("No pudimos leer el archivo"));
        reader.readAsDataURL(file);
    });

const loadImage = (dataUrl) =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("El archivo no es una imagen válida"));
        image.src = dataUrl;
    });

export async function fileToResizedDataUrl(file) {
    if (!file.type.startsWith("image/")) {
        throw new Error("Ese archivo no es una imagen");
    }

    const original = await readAsDataUrl(file);
    const image = await loadImage(original);

    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext("2d");
    // Fondo blanco: si la imagen tiene transparencia, en JPEG saldría negra.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", QUALITY);
}
