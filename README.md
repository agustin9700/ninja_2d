# Ninja Runner

Juego 2D competitivo para navegador con dos sendas, personalización de personajes y partidas en tiempo real. Dos jugadores se emparejan por WebSocket; si no aparece un rival en cuatro segundos, la carrera comienza contra un bot.

Cada jugador elige su nombre, ropa, cabello, arma y accesorio de espalda. Durante la carrera debe saltar o agacharse para esquivar kunais y puede destruirlos con un espadazo. Los proyectiles del rival se distinguen por color y también pueden ocultarse.

## Inicio rápido

Requisitos: Node.js 22 o superior.

```powershell
npm install
npm start
```

Abrí `http://127.0.0.1:8080`. Para probar el modo multijugador local, abrí la dirección en dos ventanas o navegadores.

Comprobaciones:

```powershell
npm test
```

Variables opcionales:

- `PORT`: puerto HTTP y WebSocket; por defecto `8080`.
- `HOST`: interfaz de red; por defecto `0.0.0.0`.
- `MATCH_WAIT_MS`: espera antes de activar el bot; por defecto `4000`.

## Estructura del repositorio

```text
ninja_runner/              Juego desplegable: cliente, servidor y pruebas
source/                    Fuentes XFL y piezas exportadas de personajes
tools/                     Exportadores, integradores y validadores
prototype/                 Runtime Canvas anterior, conservado como referencia
docs/                      Documentación técnica del pipeline de assets
.github/workflows/ci.yml   Pruebas automáticas para GitHub
Dockerfile                 Despliegue portable
render.yaml                Despliegue directo en Render
```

`ninja_runner_prototype/`, capturas, respaldos y cachés locales están ignorados. No son necesarios para ejecutar ni desplegar el juego.

## Controles

- `W` o `↑`: saltar.
- `S` o `↓`: agacharse.
- `J` o `Espacio`: espadazo.

También hay controles táctiles.

## Publicar en GitHub

Revisá primero los archivos nuevos con `git status`. Luego:

```powershell
git add .
git commit -m "Build multiplayer Ninja Runner"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/ninja-runner.git
git push -u origin main
```

El workflow de GitHub ejecuta las pruebas del juego y del pipeline de assets en cada push y pull request. Antes de hacer público el repositorio, elegí una licencia; por ahora no se agregó ninguna para no asumir cómo querés distribuir el proyecto.

## Despliegue

- Railway: recomendación para partidas públicas estables. Conectá el repositorio, dejá que detecte el `Dockerfile`, generá un dominio público y mantené **Serverless** desactivado para evitar esperas al buscar rival.
- Render: alternativa simple para una demo gratuita. El archivo `render.yaml` ya describe el servicio; desde el panel elegí **New > Blueprint** y conectá el repositorio. El plan gratuito puede tardar cerca de un minuto en despertar después de quedar inactivo.

El matchmaking vive en memoria. Usá una sola instancia del servidor; para escalar horizontalmente habrá que mover salas y presencia a Redis u otro almacenamiento compartido.

## Pipeline de personajes

El runtime histórico y las fuentes de Adobe Animate siguen disponibles. Las instrucciones de estructura y exportación están en [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) y [docs/REPOSITORY.md](docs/REPOSITORY.md).
