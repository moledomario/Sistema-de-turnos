import { z } from 'zod';

// Las imágenes (foto del servicio, comprobante de seña) viajan como data URL en
// base64 porque el proyecto no tiene storage externo. El navegador las
// redimensiona antes de subirlas; este tope es la red de seguridad del server
// para que nadie meta un archivo enorme en la base.
const MAX_IMAGE_CHARS = 700_000; // ~500 KB de imagen ya codificada en base64

const imageDataUrlSchema = z
    .string()
    .max(MAX_IMAGE_CHARS, 'La imagen es demasiado pesada')
    .regex(
        /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/,
        'El formato de la imagen no está soportado'
    );

export { imageDataUrlSchema, MAX_IMAGE_CHARS };
