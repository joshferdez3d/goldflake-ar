# AR Web Application

A complete Node.js + Express app using EJS, wired for a welcome → register → OTP → permissions → AR iframe flow.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
# open http://localhost:3000
```

## Structure
- `server.js` (Express app, sessions, routes)
- `views/` (EJS templates: welcome, register, otp, permissions, ar-experience, error)
- `public/css/styles.css`
- `public/js/main.js`

## Configure 8th Wall
Set `EIGHTH_WALL_URL` in `.env` to your project URL.

## Notes
- Uses sessions to store OTP and permission state.
- Designed to be mobile-first with animated UI.
