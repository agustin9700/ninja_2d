# Ninja Runner

Juego runner 2D para navegador con dos modos: Competencia y Duo cooperativo de movimiento libre. El antiguo Duo por carriles fue retirado; Flujo Ninja es ahora el unico modo Duo.

Incluye personalizacion de personajes, bot de respaldo, matchmaking WebSocket, controles tactiles responsive y animaciones construidas con piezas PNG exportadas.

## Inicio rapido

Requiere Node.js 22 o superior.

```powershell
npm install
npm start
```

Abrir `http://127.0.0.1:8080/`. Para probar multijugador local, abrir la direccion en dos ventanas o navegadores.

Variables opcionales:

- `PORT`: puerto HTTP y WebSocket; por defecto `8080`.
- `HOST`: interfaz de red; por defecto `0.0.0.0`.
- `MATCH_WAIT_MS`: espera antes de activar el bot; por defecto `4000`.

## Controles

Competencia usa W/S para saltar o agacharse y J/Espacio para atacar.

En Duo:

- W/S: subir o bajar.
- A/D: atrasarse o adelantarse.
- J/Espacio: gastar un espadazo.

Tambien hay controles tactiles.

## Pruebas

```powershell
npm test
npm --prefix ninja_runner run qa:flow
npm --prefix ninja_runner run qa:responsive
```

El nombre tecnico `flow` se conserva internamente para compatibilidad, aunque la interfaz lo presenta como Duo.

## Estructura

```text
ninja_runner/              Juego desplegable: cliente, servidor y pruebas
source/                    Fuentes XFL y piezas exportadas
tools/                     Exportadores y validadores
prototype/                 Runtime Canvas anterior de referencia
docs/                      Documentacion tecnica
```
