# Ninja 2D Runtime

Prototipo de animación 2D que exporta piezas desde Adobe Animate y reproduce sus matrices por fotograma en Canvas 2D.

## Estado actual

El personaje incluye siete estados funcionales:

- `idle`: reposo en bucle
- `crouch`: agacharse
- `run`: correr
- `jump`: saltar
- `attack`: espadazo
- `hit`: recibir un golpe
- `death`: morir y conservar la pose final

También están integrados `weapon_180`, `back_item_261`, `hair_91` y `face_01_0`. `face_01_1` queda disponible como rostro alternativo. La animación continúa usando el linkage histórico `head`, que el manifiesto resuelve a la pieza `face`; el cabello se dibuja encima siguiendo el mismo pivote. La pieza pendiente del conjunto actual es `skirt`.

## Estructura

```text
prototype/                         Aplicación web ejecutable
  assets/                          PNG y manifiestos consumidos por el runtime
  src/                             Código Canvas 2D
source/
  animations/                      Fuentes XFL de cada animación
  assets/
    character_sets/                Conjuntos de ropa
    equipment/                     Armas, cabello y accesorios traseros
    faces/                         Rostros/cabezas separados

tools/                             Generadores, exportador y validadores
docs/                              Documentación técnica
artifacts/                         Capturas locales ignoradas por Git
backups/                           Copias locales ignoradas por Git
```

La convención completa está en [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md).

## Ejecutar el prototipo

Requisitos: Python 3 para el servidor local y un navegador moderno.

```powershell
cd prototype
python -m http.server 8080
```

Abre `http://localhost:8080`. No uses `file://`, porque el navegador puede bloquear la carga de los manifiestos.

Controles:

- `A` / `D`: correr
- `S`: agacharse
- `W`: saltar
- `J`: atacar
- `G`: recibir golpe
- `M`: morir

## Regenerar animaciones

Desde la raíz:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-IdleAnimation.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-CrouchAnimation.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-RunAnimation.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-JumpAnimation.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-AttackAnimation.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-HitAnimation.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-DeathAnimation.ps1
node tools/test_runtime_data.js
```

## Exportar e integrar piezas

La exportación requiere Adobe Animate con archivos `.jsfl` asociados a Animate.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Export-CharacterAssets.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Integrate-CharacterAssets.ps1
node tools/test_runtime_data.js
```

Para activar el rostro alternativo:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Integrate-CharacterAssets.ps1 -FaceAssetId face_01_1
```

`Export-CharacterAssets.ps1` calcula las rutas desde la ubicación del repositorio, por lo que el proyecto puede clonarse en otra carpeta. Por seguridad no cierra Animate al finalizar; usa `-QuitAnimate` solo cuando no haya documentos sin guardar.

## Preparar el primer commit

Los archivos de respaldo, capturas, cachés de Animate y salidas temporales ya están excluidos. No se requiere Git LFS con el tamaño actual de los archivos fuente.

```powershell
git init
git add .
git status
git commit -m "Initial Ninja 2D runtime prototype"
```

Antes de publicar, revisa [docs/REPOSITORY.md](docs/REPOSITORY.md) y elige una licencia si el repositorio será público.
