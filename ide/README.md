# Stellar Kit Canvas

Soroban online ide

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start development server:
   ```sh
   npm run dev
   ```
3. Build for production:
   ```sh
   npm run build
   ```
## AI Assistant setup

The IDE now includes an `AI Chat` sidebar tab backed by `POST /api/chat` with server-sent event streaming.

1. Copy [`./.env.example`](/home/chinonso-peter/stellar-suite/ide/.env.example) into a local `.env.local`.
2. Set either `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.
3. Restart the Next.js dev server.

The sidebar keeps provider keys on the server, and active-file content is only sent to the provider when the user explicitly enables the opt-in toggle in the chat pane.
