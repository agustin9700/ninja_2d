# Preparación del repositorio

## Qué se versiona

Se versionan el runtime, los manifiestos ejecutables, los PNG necesarios, las fuentes XFL/FLA, los scripts y la documentación. Los archivos binarios actuales están por debajo del límite individual habitual de GitHub, por lo que Git LFS no es necesario todavía.

## Qué queda local

`.gitignore` excluye:

- `backups/`, porque contiene copias completas e históricas;
- `artifacts/`, porque contiene capturas y perfiles temporales del navegador;
- carpetas `bin/` internas de Animate;
- publicaciones SWF/AIR/APK, logs, temporales y archivos de recuperación;
- configuraciones privadas del editor.

Excluir estos archivos no los elimina del equipo.

## Comprobación antes de publicar

```powershell
node tools/test_runtime_data.js
git status --short
git diff --check
git ls-files | Sort-Object
```

Confirma además que:

- `prototype/` arranca mediante servidor HTTP;
- ningún archivo supera el límite del proveedor Git;
- no hay claves, tokens ni datos personales;
- se eligió una licencia apropiada si el repositorio será público.

## Primer commit

```powershell
git init
git add .
git status
git commit -m "Initial Ninja 2D runtime prototype"
```

El repositorio remoto y la licencia se dejan como decisión del propietario del proyecto.
