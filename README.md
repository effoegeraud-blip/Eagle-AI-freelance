# Eagle AI Freelance
1. `npm install`
2. `cp .env.example .env` puis renseigner les clés
3. Exécuter `supabase/schema.sql` dans l'éditeur SQL Supabase
4. `npm run dev` (front : :5173, API/webhook : :3001)
5. Webhook SasPay → `https://VOTRE_DOMAINE/api/webhooks/saspay` (en local : ngrok/cloudflared)
