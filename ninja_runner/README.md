# Ninja Runner

Runner 2D para navegador con dos modos:

- **Competencia:** carrera original en dos sendas, contra otra persona o un bot.
- **Duo:** modo cooperativo de movimiento libre antes llamado Flujo Ninja. Los dos ninjas corren simultaneamente, pueden subir, bajar, adelantarse o atrasarse y deben completar juntos 1200 metros.

El antiguo Duo por carriles fue retirado. Los enlaces o clientes que soliciten `mode=duo` se redirigen al nuevo Duo.

## Jugabilidad de Duo

Cada ninja comienza con 2 vidas y 2 espadazos. Las recompensas disponibles son:

- `GUARD`: bloquea un impacto y dura como maximo 10 segundos.
- `EXPLOSION TOTAL`: destruye todos los kunais activos.
- `VIDA +1`: recupera una vida hasta un maximo de 3.
- `FILOS +1`: recupera un espadazo hasta un maximo de 8.

El ninja que se adelanta recibe primero los kunais. Guard se representa con un aura pulsante y un temporizador, sin lineas ni atraccion entre personajes. Sobre cada ninja se muestran sus vidas restantes.

Las formaciones incluyen muros con hueco, diagonales, pinzas, serpientes y fuego cruzado. Los patrones evitan repetirse consecutivamente y muestran una pista breve antes de entrar en la zona de reaccion.

## Controles

Competencia:

- `W` / flecha arriba: saltar.
- `S` / flecha abajo: agacharse.
- `J` / Espacio: atacar.

Duo:

- `W` / flecha arriba: subir.
- `S` / flecha abajo: bajar.
- `A` / flecha izquierda: atrasarse.
- `D` / flecha derecha: adelantarse.
- `J` / Espacio: gastar un espadazo.

Todos los controles tienen equivalentes tactiles responsive.

## Ejecutar

Requiere Node.js 22 o superior.

```powershell
npm install
npm start
```

Abrir `http://127.0.0.1:8080/`. Para probar multijugador local, abrir la direccion en dos ventanas o navegadores.

El servidor usa HTTP y WebSocket en el mismo puerto. `MATCH_WAIT_MS` controla cuanto espera el matchmaking antes de incorporar un bot.

## Pruebas

```powershell
npm test
npm run qa:flow
npm run qa:responsive
```

`qa:flow` conserva ese nombre tecnico por compatibilidad interna, pero prueba el nuevo modo Duo.
