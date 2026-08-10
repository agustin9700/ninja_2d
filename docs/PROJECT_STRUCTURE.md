# Organización del proyecto

## Regla general

Las fuentes editables, los recursos ejecutables, las capturas de revisión y las copias históricas viven en carpetas distintas. Las carpetas activas usan nombres estables; las variantes o recuperaciones se guardan en `backups/`.

## Carpetas canónicas

- `source/animations/<animation_id>/`: paquete XFL completo de una animación.
- `source/assets/character_sets/<set_id>/`: FLA, ActionScript, XFL y exportaciones de un conjunto de ropa.
- `source/assets/equipment/<asset_id>/`: armas, cabello y accesorios traseros.
- `source/assets/faces/<face_id>/`: rostros o cabezas separados del cabello.
- `prototype/assets/`: PNG y JSON listos para el navegador; no es la fuente principal.
- `prototype/src/`: runtime Canvas 2D.
- `tools/`: scripts reproducibles de construcción, exportación y prueba.
- `docs/`: decisiones y documentación técnica.
- `artifacts/`: capturas y diagnósticos locales; está ignorado por Git.
- `backups/`: instantáneas previas a cambios; está ignorado por Git.

## Convención de nombres

- Carpetas e IDs funcionales: inglés, minúsculas y `snake_case`.
- Animaciones: `idle`, `crouch`, `run`, `jump`, `attack`, `hit`, `death`.
- Piezas: linkages existentes como `upper_body`, `left_hand`, `head` y `back_hair`.
- Recursos de inventario: tipo más ID original, por ejemplo `weapon_180`, `back_item_261`, `hair_91` y `face_01_0`.
- Los archivos internos de XFL (`DOMDocument.xml`, `LIBRARY`, símbolos y nombres de capas) no se renombran.

## Paquete de recurso

```text
<asset_id>/
  xfl/                     Documento XFL descomprimido
  exports/                 PNG y manifiestos exportados
  <asset_id>.fla           Fuente FLA, si existe
  *.as                     Clases ActionScript originales, si existen
```

Los conjuntos de personaje pueden incluir `fla_support/` para clases auxiliares.

## Flujo de trabajo

1. Editar la fuente dentro de `source/`.
2. Regenerar animaciones o exportar piezas con los scripts de `tools/`.
3. Integrar únicamente la salida necesaria dentro de `prototype/assets/`.
4. Ejecutar `node tools/test_runtime_data.js`.
5. Probar visualmente desde el servidor local de `prototype/`.
6. Antes de un cambio amplio, crear una copia descriptiva dentro de `backups/`.

## Cabeza y cabello

Los timelines conservan el linkage `head`. El manifiesto lo resuelve a `face`, mientras `hair` es un accesorio dibujado después de la cara y anclado al mismo origen. Esto permite cambiar rostro y cabello de forma independiente sin editar cada animación.
