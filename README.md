# Servidor de Revalúa (versión gratuita, con Gemini)

Este servidor recibe las peticiones de la app (fotos, mensajes de negociación, etc.), llama a la API gratuita de Gemini (Google), y devuelve el resultado. La clave nunca queda expuesta en la app — vive solo aquí, en el servidor.

## 1. Consigue tu clave gratis de Google AI Studio

1. Entra a **aistudio.google.com** y entra con tu cuenta de Google (la misma de Gmail sirve).
2. Busca el botón **"Get API key"** (usualmente arriba a la izquierda o en el menú).
3. Toca **"Create API key"**.
4. Copia la clave — no pide tarjeta ni pago para esto.

La capa gratuita tiene límites (una cantidad de fotos por día), pero es suficiente para probar la app sin gastar nada.

## 2. Prueba el servidor en tu computadora (opcional pero recomendado)

```bash
npm install
cp .env.example .env
# abre .env y pega tu clave real en GEMINI_API_KEY
npm start
```

Deberías ver `Servidor de Revalúa corriendo en el puerto 3000`. Abre `http://localhost:3000` en el navegador — si dice "Revalúa API funcionando ✅ (usando Gemini)", va bien.

## 3. Súbelo a internet (Railway)

Si ya tenías el servidor anterior en Railway (el de Anthropic), solo necesitas:

1. Reemplaza el archivo `server.js` en tu repositorio de GitHub con este nuevo (edítalo directo en GitHub, o sube este archivo de nuevo).
2. En Railway, ve a la pestaña **Variables**.
3. Borra `ANTHROPIC_API_KEY` (ya no se usa).
4. Agrega `GEMINI_API_KEY` = tu clave nueva de Google AI Studio.
5. Railway va a re-desplegar solo en cuanto detecte el cambio en GitHub — espera un par de minutos.

Si es la primera vez que lo subes, sigue los mismos pasos que la primera vez (New Project → Deploy from GitHub repo), pero usando `GEMINI_API_KEY` en vez de `ANTHROPIC_API_KEY`.

## Endpoints disponibles

Son los mismos de antes — la app no necesita ningún cambio, solo el servidor cambió por dentro.

| Ruta | Qué hace | Cuerpo que espera |
|---|---|---|
| `POST /api/analyze-item` | Tasar un artículo para vender | `{ imageBase64 }` |
| `POST /api/analyze-purchase` | Identificar y buscar dónde comprar | `{ imageBase64 }` |
| `POST /api/negotiate` | Sugerir respuesta a un comprador | `{ itemContext, buyerMessage }` |
| `POST /api/price-drop` | Sugerir bajar precio | `{ title, category, condition, currency, price }` |

## Seguridad — importante

- **Nunca** subas el archivo `.env` a GitHub.
- Si tu clave se filtra alguna vez, revócala en **aistudio.google.com** y crea una nueva.

## Si más adelante quieres más capacidad

La capa gratuita de Gemini tiene límites diarios. Si tu app crece y los alcanzas seguido, puedes activar facturación en la misma cuenta de Google AI Studio para subir esos límites — es opcional, no hace falta para probar la app.
