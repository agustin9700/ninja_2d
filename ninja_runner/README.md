# Ninja Runner

Runner 2D competitivo con dos sendas y partidas en tiempo real. Tu ninja corre por el corredor inferior contra otro jugador visible en la senda superior; los kunais vuelan desde la derecha hacia la izquierda y el espadazo genera una explosión en el punto de contacto.

Cada jugador puede elegir un nombre de hasta 18 caracteres. El nombre y la vestimenta se sincronizan con el rival y se conservan localmente para la próxima partida.

Antes de largar se puede alternar entre dos opciones para cada slot:

- Ropa: `classic` / `set_186_0`.
- Cabello: `classic` / `hair_83_0`.
- Arma: `classic` / `weapon_182`.
- Espalda: `classic` / `back_item_351`.

Al pulsar “Buscar rival”, el servidor empareja a dos personas y sincroniza progreso, animaciones, vestimenta, vidas, kunais y explosiones. Si en cuatro segundos no aparece otra persona, la partida arranca contra el bot completo. Si el rival se desconecta durante la carrera, el bot toma su lugar sin reiniciar el mapa. La carrera termina al alcanzar los 800 metros o al perder las tres vidas.

Los kunais que está enfrentando el rival se muestran en violeta para diferenciarlos de los propios. Un botón flotante con forma de ojo permite ocultarlos o mostrarlos durante la carrera y recuerda la elección en el navegador.

Durante partidas online, el HUD muestra el ping medido contra el servidor. Las poses del rival usan un búfer corto para mantener el orden visual cuando la latencia fluctúa. Al terminar, “Volver al lobby” permite cambiar nombre y equipo antes de buscar otra carrera.

## Ejecutar

Desde esta carpeta:

```powershell
npm start
```

Abrí la dirección http://127.0.0.1:8080/ en dos navegadores para probar una partida local. Para jugar desde otro equipo de la misma red, compartí la IP local de la computadora que ejecuta el servidor, usando el mismo puerto 8080.

El servidor escucha conexiones WebSocket en la misma dirección. En producción, el proxy o plataforma de despliegue debe permitir upgrades WebSocket. El tiempo de espera puede cambiarse con la variable MATCH_WAIT_MS.

## Controles

- `W` o `↑`: saltar.
- `S` o `↓`: agacharse (mantener).
- `J` o `Espacio`: espadazo.

También incluye controles táctiles. Para ejecutar las comprobaciones estáticas:

```powershell
npm test
```
