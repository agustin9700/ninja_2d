# Auditoría del pipeline FLA/XFL → Ninja 2D Runtime

## Resultado

La pose de `clothing_579_0` no estaba fallando por falta de offsets. El manifest v2
había capturado el timeline después de borrar el stage del documento fuente durante
la exportación. Por eso contenía una sola capa, una sola instancia (`right_hand`) y
una matriz contaminada por la escala de raster `150 / 72`.

El pipeline corregido conserva las 14 capas, las 14 instancias y las matrices exactas
del XFL. La comparación automatizada devuelve una diferencia máxima de matriz igual
a cero.

## Qué define realmente este XFL

`set_579_0/DOMDocument.xml` define una escena con:

- 14 `DOMLayer`, ordenadas de frente hacia atrás (índice 0 es la capa superior);
- un keyframe por capa;
- una `DOMSymbolInstance` por capa;
- una matriz local `a,b,c,d,tx,ty` por instancia;
- un punto de transformación vacío (`<Point/>`), equivalente al origen local;
- ninguna capa bone, ningún `parentLayerIndex` anatómico y ningún anidamiento entre
  las 14 piezas de la pose.

En esta escena las piezas son hermanas. La matriz local respecto de la escena también
es su matriz de stage. Las relaciones hombro → antebrazo → mano no están almacenadas
como jerarquía de huesos en este clothing FLA y no deben inferirse por proximidad.

Los XML de `LIBRARY` sí contienen timelines internos y referencias entre símbolos,
pero esa estructura describe cómo se dibuja cada símbolo (shapes y wrappers), no un
skeleton anatómico compartido. El manifest v3 conserva también esos timelines para
no perder información.

## Registro, recorte y matriz

El origen del símbolo de Animate es `(0, 0)`. Al rasterizar, el arte se escala por:

```text
S = targetPpi / basePpi = 150 / 72
```

y se desplaza dentro del PNG para incluir bounds, origen y margen. Ese desplazamiento
produce `registrationPx`; no cambia la matriz de la instancia.

Para un píxel local `pRaster` del PNG, el runtime recupera la coordenada del símbolo:

```text
pSource = (pRaster - registrationPx) / S
```

y aplica una sola vez la matriz autoritativa de Animate:

```text
xStage = a*xSource + c*ySource + tx
yStage = b*xSource + d*ySource + ty
```

La cámara de debugging se aplica después. `rotation`, `scaleX` y `scaleY` son datos
derivados para inspección; no se vuelven a aplicar encima de `element.matrix`.

## Orden de dibujo

Animate/XFL guarda la capa superior en el índice 0. Canvas pinta lo último por delante,
por lo que el runtime recorre las capas desde el último índice hasta cero.

## Cambios implementados

- El JSFL toma primero una instantánea de escenas y timelines de biblioteca.
- Los PNG se generan en un documento temporal creado por Animate.
- El FLA/XFL abierto ya no se limpia, redimensiona ni modifica.
- `asset_manifest.json` v3 declara espacios de coordenadas, escala de raster, orden de
  capas, matrices locales, frames, capas, instancias y timelines de símbolos.
- `_unity_pivots.json` se mantiene como salida de compatibilidad.
- El runtime usa la matriz affine completa y compensa la escala de raster.
- El inspector visual muestra pivots, bounds, ownership de timeline, matrices y orden
  de capas, con selección por pieza.
- La primera auditoría aisló la pose fuente. El runtime actual vuelve a incorporar
  animaciones externas después de esa validación.

## Verificación reproducible

El manifest incluido se reconstruyó desde el XFL con:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Build-XflPoseManifest.ps1 `
  -XflDirectory source/assets/character_sets/set_579_0/xfl `
  -ExistingManifest prototype/assets/asset_manifest.json `
  -OutputManifest prototype/assets/asset_manifest.json
```

La igualdad XFL ↔ manifest se comprueba con:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Test-PoseManifest.ps1 `
  -XflDirectory source/assets/character_sets/set_579_0/xfl `
  -Manifest prototype/assets/asset_manifest.json
```

Resultado actual:

```text
Layers: 14
Instances: 14
Maximum matrix delta: 0
Missing PNG: 0
```

## Estado actual del runtime

Los siete timelines se convierten con un generador común y conservan:

- la duración real como `max(index + duration)`;
- la matriz de la instancia raíz de `DOMDocument.xml`;
- las matrices internas en espacio `symbolLocal`;
- dependencias, instancias sin nombre y orden de capas;
- una velocidad de reproducción propia para evitar ciclos demasiado lentos.

El runtime compone la matriz raíz con cada matriz de pieza y aplica una alineación
constante respecto de la pose base. La muerte añade un ajuste propio de suelo y caída
hacia atrás, pero conserva su último frame.

Resultado de la validación de datos:

```text
Idle:   22 frames, 19+ parts
Crouch: 11 frames, 18+ parts
Run:    16 frames, 19+ parts
Jump:   49 frames, 18+ parts
Attack: 21 frames, 19+ parts
Hit:    16 frames, 19+ parts
Death:  17 frames, 19+ parts
```

## Piezas externas

El manifiesto integra cuatro recursos independientes:

- `weapon_180` anclado a `left_hand`;
- `back_item_261` anclado a `upper_body` y dibujado detrás;
- `face_01_0` como implementación del linkage histórico `head`;
- `hair_91` anclado a `face` y dibujado después de ella.

Los pivotes raster de cara y cabello se recalcularon desde sus bounds XFL para que
compartan el origen de símbolo. Las pruebas visuales confirman que permanecen unidos
en reposo, carrera, salto y muerte. `back_hair` se suprime porque el paquete `hair_91`
ya contiene la parte trasera del cabello.

La única dependencia sin imagen del conjunto actual es `skirt`; el validador la
informa como aviso y no como error fatal.

## Límite de la validación

La equivalencia geométrica de matrices se comprueba automáticamente y la composición
se revisó visualmente. Un pixel-diff absoluto todavía requeriría referencias raster
exportadas directamente desde Animate para los mismos frames, tamaño, cámara y fondo
transparente.
