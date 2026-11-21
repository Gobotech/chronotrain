# ChronoTrain

**Retro Fitness** — a neon 80s interval timer for Tabata, HIIT and series workouts.

## Features

- Configurable number of rounds.
- Configurable work, rest and pre-start times.
- Visual + audible cues at the beginning of WORK, REST and GET READY phases.
- 5-second countdown cue with **GET READY!** or **FINAL EFFORT**.
- Pause, resume, skip and stop controls.
- Screen Wake Lock while a workout is active (where supported).
- Installable PWA with offline cache.
- Designed for iPhone/mobile first.
- No backend and no personal data collection.

## Publish with GitHub Pages

1. Create a **public GitHub repository**, e.g. `chronotrain`.
2. Upload all files from this folder to the repository root.
3. In GitHub go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`, then save.
6. Open the GitHub Pages URL in Safari on your iPhone.
7. Tap **Share → Add to Home Screen → Add**.

GitHub Pages serves the site over HTTPS, which is required for the Screen Wake Lock API.

## Important limitation: locked iPhone / background

ChronoTrain uses the Screen Wake Lock API to prevent the screen from locking while the workout is open and active. A PWA cannot reliably keep JavaScript timers and local audio cues executing after iOS suspends it in the background or when the phone is locked.

The timer is based on absolute elapsed time, so if the PWA is suspended it will catch up correctly when it becomes active again. However, sound/visual phase alerts **cannot be guaranteed while the device is locked**.

If guaranteed locked-screen alerts are mandatory, ChronoTrain needs a native iOS version (Swift/SwiftUI) using iOS background/audio or notification capabilities and distribution via Xcode/TestFlight/App Store rather than GitHub Pages alone.

## Files

- `index.html` — app structure.
- `styles.css` — Neon Athletic 80s UI.
- `app.js` — timer, audio cues, Wake Lock and controls.
- `manifest.webmanifest` — PWA installation metadata.
- `sw.js` — offline cache/service worker.
- `icons/` — app icons.


## Novedades v1.1

- Sin año 1986, nuevo lema: **Beat the Clock. Train harder.**
- **Series** (agrupaciones de rondas): por ejemplo, 3 series × 8 rondas = 24 bloques de trabajo; hay un descanso entre cada bloque de trabajo, incluso entre series. No se añade descanso tras el último bloque.
- Controles `+` y `−` para series, rondas y tiempos (tiempos en pasos de 5 s). Puedes escribir también un valor exacto.
- Nombre y descripción opcionales del entrenamiento. Los entrenamientos **completados** se guardan automáticamente en el historial local de este dispositivo mediante `localStorage`. Los entrenamientos detenidos antes de terminar no se registran. El historial se puede borrar desde la app.
- Los datos no se sincronizan entre dispositivos y pueden perderse si se borran los datos del navegador/PWA.
- Para actualizar en GitHub Pages, reemplaza los archivos existentes en la raíz y espera el despliegue de Pages.


## Novedades v1.2

- Nuevo **REST BETWEEN SERIES** independiente de REST, con controles ±5 segundos (por defecto, 60 s).
- REST se aplica únicamente entre rondas de la misma serie; REST BETWEEN SERIES solo entre series, nunca al final.
- Al terminar se pregunta si deseas registrar el entrenamiento. Si aceptas, introduces nombre obligatorio y descripción opcional; si no, no se guarda.
- TRAINING LOG se abre desde el botón **LOG** de la cabecera, sin ocupar espacio en la pantalla de configuración.
- Los registros de la versión 1.1 siguen almacenados con la misma clave de `localStorage` y se visualizan en el historial.
- Si tienes instalada la PWA y no aparecen los cambios, cierra y vuelve a abrir la app tras actualizar GitHub Pages.


## Novedades v1.3

- Eslogan: Train hard. Beat the clock.
- Descripción simplificada de la configuración.
- Selectores ordenados en tres filas de dos: SERIES / REST BETWEEN SERIES; ROUNDS / WORK; REST / GET READY.
- Cache Service Worker actualizada para facilitar la publicación de la nueva versión.
