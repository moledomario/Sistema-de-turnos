# · Sistema de Reserva de Turnos Online

---

## 💡 ¿De qué se trata?
Es un sistema de turnos basico para diferentes profesionales, no esta terminado del todo pero cumple con las funcionalidades basicas de un sistema de turnos (calendario, solapamientos, zona horaria, etc), mas abajo vas a poder ver como funciona el flujo de la app. Este proyecto lo realize para mejorar mis habilidades y entendimiento del backend, y fue mejorado con Claude Code, es un sistema libre de uso asi que puedes hacer lo que quieras con el si deseas usarlo. 
---

## ✨ Características Principales

- 🔗 **Enlace propio y compartible:** Listo para poner en la biografía de Instagram, enviar por WhatsApp o integrar en tu web.
- ⚡ **Reservas sin fricción (Cero contraseñas para clientes):** Los clientes reservan directamente como invitados en 4 pasos, sin trámites previos ni tener que recordar una contraseña más.
- 📬 **Acceso seguro por email (Magic Link):** Si un cliente necesita revisar, reprogramar o cancelar sus turnos, ingresa su correo y recibe un enlace de acceso temporal directo.
- 🛡️ **Garantía anti-solapamiento:** Protegido directamente a nivel de base de datos; dos personas jamás podrán reservar el mismo hueco al mismo tiempo.
- 👥 **Soporte para equipos de trabajo:** Ideal tanto para quien atiende solo como para locales con múltiples colaboradores (barberías, consultorios, centros de estética), cada uno con su propia agenda.
- 🌍 **Manejo confiable de zonas horarias:** Diseñado desde el inicio para evitar que los turnos se desfasen cuando el servidor corre en otra zona horaria (UTC).
- 📊 **Control real de asistencia:** Permite distinguir entre turnos efectivamente atendidos y ausencias (*no-show*), ayudando a medir y reducir el ausentismo.

---

## 🔄 Los Dos Recorridos (Flujos de Usuario)

### 1. El recorrido del cliente final (Reservar en 4 pasos)

El proceso está pensado para que reservar sea tan simple que nadie abandone la página:

```
[ 1. Abre el enlace ] ➔ [ 2. Elige servicio ] ➔ [ 3. Elige horario libre ] ➔ [ 4. Deja sus datos ] ➔ ✅ ¡Turno Reservado!
```

1. **Abre el enlace:** Ingresa a la dirección pública del profesional (`/turnos/nombre-profesional`).
2. **Elige el servicio:** Consulta qué incluye, cuánto dura, su precio y si requiere abonar una seña previa.
3. **Elige día y hora:** El calendario muestra exclusivamente los horarios disponibles en tiempo real. *(Primero se elige el horario y después se piden los datos personales; si se pidieran al revés y luego no hubiera lugar, la persona se iría frustrada).*
4. **Ingresa sus datos de contacto:** Solo su nombre, correo electrónico y teléfono. Si el servicio requiere seña, puede adjuntar su comprobante de transferencia bancaria.
5. **Confirmación automática:** Recibe un email con todos los datos de su cita.

> **¿Cómo consulta o cancela su turno más adelante?**  
> En la sección *Mis Turnos*, el cliente escribe su email y recibe un enlace mágico temporal válido por 30 minutos de un solo uso. Entra con un clic, sin contraseñas.

---

### 2. El recorrido del profesional o negocio (Su centro de control)

1. **Puesta en marcha asistida (Onboarding):** Al crearse una cuenta, un asistente paso a paso le pide lo esencial para que su enlace empiece a funcionar: nombre de su negocio, al menos un servicio y sus horarios semanales de atención.
2. **Panel de administración organizado en siete secciones:**
   - 📅 **Calendario:** Vista completa de las citas de cada día o semana. Al abrir el calendario, el sistema cierra automáticamente los turnos pasados sin necesidad de procesos de fondo pesados.
   - 📥 **Solicitudes pendientes:** Permite revisar y aceptar o rechazar solicitudes antes de confirmarlas (ideal para profesionales que evalúan cada caso). Quien prefiera confirmación directa puede activar la opción de auto-aceptación.
   - ⏱️ **Horarios y disponibilidad:** Configuración semanal con soporte para horarios cortados (por ejemplo: lunes de 9 a 13 hs y de 15 a 19 hs).
   - 💼 **Servicios:** Creación y edición de servicios con duraciones a medida, precios, fotos y configuración de señas bancarias.
   - 👥 **Equipo:** Permite agregar integrantes del equipo para que los clientes puedan elegir con quién atenderse.
   - ⚙️ **Configuración:** Reglas de anticipación mínima (para evitar que alguien reserve 5 minutos antes) y plazos límites para cancelaciones.

---

## 🧠 Decisiones de Diseño (Explicadas en palabras simples)

Detrás de la experiencia sencilla hay varias decisiones técnicas orientadas a la robustez:

- **Por qué el cliente no se registra con contraseña:** Obligar a una persona a inventar una clave para cortarse el pelo o pedir una consulta médica es la causa número uno de abandono. Reservar como invitado replica la experiencia fluida de herramientas como Calendly.
- **La base de datos tiene la última palabra contra turnos duplicados:** Dos clientes pueden presionar el botón de reservar al mismo milisegundo. Aunque el servidor verifique la disponibilidad milisegundos antes, la garantía real la impone una regla física en la base de datos (PostgreSQL), impidiendo solapamientos sin importar cuántas visitas simultáneas haya.
- **Horarios en minutos desde la medianoche:** En vez de guardar fechas completas para la disponibilidad semanal, las franjas se guardan como minutos transcurridos del día (por ejemplo, de 9:00 a 18:00 hs son los minutos `540` a `1080`). Esto hace los cálculos ultrarrápidos y evita problemas de conversión entre países o cambios de horario de verano.
- **El titular es un miembro más del equipo:** Quien trabaja solo es modelado como un equipo de una sola persona. Esto unifica las reglas de negocio en el código y evita duplicar caminos distintos para cuentas individuales y cuentas compartidas.
- **Cobros que cuidan a los usuarios:** Si la suscripción de un negocio expira, nunca se cancelan ni borran los turnos que los clientes ya tenían reservados. Solo se suspende la recepción de turnos nuevos en el enlace público, mostrando un mensaje neutral de contacto sin exponer problemas de pago.

---

## 🛠️ Tecnologías Utilizadas

El sistema está construido desacoplando la interfaz de usuario del servidor, comunicándose mediante una API REST:

| Capa | Tecnología | ¿Por qué se eligió? |
| :--- | :--- | :--- |
| **Frontend (Interfaz)** | [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/) | Renderiza en el servidor las páginas públicas para que el enlace de reserva cargue de inmediato, y ofrece dinamismo en el panel privado. |
| **Estilos y Componentes** | [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide React](https://lucide.dev/) | Diseño limpio, moderno, completamente adaptable a celulares y tablets. |
| **Backend (Servidor)** | [Node.js](https://nodejs.org/) + [Express 5](https://expressjs.com/) | API REST modular, sin estado y estructurada en 4 capas limpias (Rutas, Validación con Zod, Lógica de Negocio y Datos). |
| **Base de Datos & ORM** | [PostgreSQL](https://www.postgresql.org/) + [Prisma 7](https://www.prisma.io/) | Estructura relacional con restricciones estrictas de integridad y migraciones controladas. |
| **Correos Electrónicos** | [Resend](https://resend.com/) | Entrega rápida de avisos de turnos nuevos, confirmaciones, cancelaciones y enlaces mágicos. |
| **Testing Automatizado** | [Vitest](https://vitest.dev/) | Batería de más de 270 pruebas que validan cálculos de disponibilidad, zonas horarias y permisos en 2 segundos. |

---

## 🚀 Puesta en Marcha Local (Desarrollo)

Si querés explorar el código, ejecutar el proyecto en tu computadora o contribuir, seguí estos pasos:

### Prerrequisitos
- **Node.js** (v20 o superior recomendado)
- **PostgreSQL** instalado o una base de datos en la nube (como Supabase, Neon o Render)
- **npm** (o tu gestor de paquetes favorito)

---

### 1. Clonar el repositorio
```bash
git clone https://github.com/moledomario/Sistema-de-turnos.git
cd Sistema-de-turnos
```

---

### 2. Configurar y levantar el Servidor (`/server`)

1. Entrá a la carpeta del servidor e instalá las dependencias:
   ```bash
   cd server
   npm install
   ```

2. Creá el archivo `.env` a partir del ejemplo:
   ```bash
   cp .env.example .env
   ```

3. Abrí `.env` y configurá tus variables principales:
   - `DATABASE_URL` y `DATABASE_CONNECTION`: dirección de tu base PostgreSQL.
   - `JWT_SECRET`: una clave secreta para firmar los tokens de sesión.
   - `APP_URL`: la dirección del frontend (`http://localhost:3000` por defecto).
   - *(Opcional)* `RESEND_API_KEY`: si querés enviar mails reales (si está vacía, los emails se muestran en la consola).
   - *(Opcional)* `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`: para probar pagos con Mercado Pago.

4. Aplicá las migraciones y generá el cliente de Prisma:
   ```bash
   npm run migrate:deploy
   npm run postinstall
   ```

5. Iniciá el servidor:
   ```bash
   npm start
   ```
   > El servidor quedará corriendo en `http://localhost:3001`.

6. Para ejecutar las pruebas automáticas:
   ```bash
   npm test
   ```

---

### 3. Configurar y levantar la Interfaz Web (`/client`)

1. En una nueva terminal, ingresá a la carpeta del frontend:
   ```bash
   cd client
   npm install
   ```

2. Iniciá el entorno de desarrollo:
   ```bash
   npm run dev
   ```
   > Abrí tu navegador en [http://localhost:3000](http://localhost:3000) para ver la aplicación en funcionamiento.

---

## 📁 Estructura del Proyecto

```text
├── client/                     # Aplicación Frontend (Next.js 16 + React 19)
│   ├── src/
│   │   ├── app/
│   │   │   ├── turnos/[slug]/  # Flujo público de reserva para clientes
│   │   │   ├── panel/          # Panel privado del profesional (calendario, servicios, etc.)
│   │   │   ├── mis-turnos/     # Portal de consulta de turnos del cliente
│   │   │   ├── onboarding/     # Asistente de configuración inicial
│   │   │   └── ...
│   │   └── components/         # Componentes visuales reutilizables
│   └── package.json
│
├── server/                     # Servidor Backend (Node.js + Express 5 + Prisma 7)
│   ├── controllers/            # Controladores que reciben las peticiones HTTP
│   ├── services/               # Lógica pura del negocio y reglas de turnos
│   ├── routes/                 # Rutas de la API (/auth, /appointments, /panel, etc.)
│   ├── schemas/                # Validaciones de entrada de datos con Zod
│   ├── prisma/                 # Modelado de datos, migraciones y seed
│   ├── indice.js               # Entrada principal y configuración de Express
│   └── package.json
│
└── README.md                   # Esta documentación
```

---

## 📄 Licencia

Este proyecto está disponible como software libre bajo los términos de la licencia **MIT**. Podés usarlo, estudiarlo, adaptarlo y desplegarlo libremente.
