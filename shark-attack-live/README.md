# 🦈 SHARK ATTACK LIVE

Jogo 2D interativo para **TikTok LIVE** (formato vertical 1080×1920).
Um mergulhador tenta sobreviver no centro da tela enquanto tubarões chegam
pelas bordas — e **o público interfere**: presentes invocam tubarões (com o
nome de quem enviou), curtidas geram caos, seguidores curam, e comentários
ativam ataques.

> Presentes e interações **apenas modificam o jogo**. Não há apostas, sorteios,
> prêmios, dinheiro nem qualquer vantagem fora do jogo. Os "pontos" do ranking
> são apenas visuais.

## Como iniciar (Windows)

1. Instale o **Node.js 22 LTS** (ou 20.19+): <https://nodejs.org>
2. No terminal, dentro da pasta `shark-attack-live`:

```powershell
npm install
npm run dev
```

3. Abra **<http://localhost:5173/>** → modo **DEVELOPER** (botões de teste à direita).
4. Clique uma vez na página para liberar o som (exigência dos navegadores).

## Usar na LIVE com OBS

1. Em um terminal, deixe rodando: `npm run build` e depois `npm run preview`
   (ou simplesmente `npm run dev`).
2. No OBS: **Fontes → + → Navegador (Browser Source)**:
   - URL: `http://localhost:4173/?mode=stream` (com `preview`) ou
     `http://localhost:5173/?mode=stream` (com `dev`)
   - Largura **1080**, Altura **1920**
   - Marque **"Controlar áudio via OBS"** se quiser mixar o som do jogo.
3. A cena do OBS deve estar no formato vertical (Configurações → Vídeo → 1080×1920).

`?mode=stream` = **STREAM MODE**: só o jogo e a interface da LIVE, sem botões nem
informações técnicas. Sem o parâmetro = **DEVELOPER MODE**.
Na janela do jogo, **Ctrl+Shift+D** alterna entre os modos.

## Testar os eventos (sem TikTok)

No DEVELOPER MODE, digite um nome em **"Nome do jogador"** e use os botões:

| Botão | Efeito no jogo |
|---|---|
| + SEGUIDOR | "🔥 Nome entrou no jogo!", cura o jogador + escudo curto |
| + 100 CURTIDAS | Enche a barra de caos; a cada 100 curtidas nascem tubarões pequenos |
| COMENTÁRIO: ATAQUE | Jogador dispara arpões em círculo (cooldown por usuário) |
| COMENTÁRIO: ESCUDO | Escudo temporário |
| 🌹 PRESENTE | 1 tubarão pequeno com o nome de quem enviou |
| 💎 PRESENTE MÉDIO | 3 pequenos + 2 médios |
| 🎁 PRESENTE GRANDE | Tubarão GIGANTE + alerta |
| 👑 PRESENTE RARO | **MEGA TUBARÃO** + alerta grande no centro |
| ⚡ Estresse | 50 eventos de uma vez (testa estabilidade) |
| 💀 Forçar GAME OVER | Testa a tela de fim e o reinício automático |

Os botões geram **exatamente** o mesmo JSON que o provedor externo envia. Também
dá para disparar pelo console do navegador (F12), só no modo dev:

```js
sharkGame.mock.gift("Ana", "crown");
sharkGame.mock.emit({ type: "like", amount: 300, username: "Ana" });
```

## Testes automatizados

```powershell
npm test          # 37 testes de lógica (eventos, interações, sistemas, simulação)
npm run typecheck
```

## Arquitetura

```
Entrada externa (bridge WebSocket)      Botões DEV / console
        │                                       │
TikTokInteractionProvider            MockInteractionProvider
        └──────────────┬────────────────────────┘
               parseInteractionEvent()   ← validação/sanitização única
                       ▼
              InteractionManager         ← fila, cooldowns, curtidas→caos, ranking
                       ▼  (interface GameActions)
                     Game                ← Spawn / Difficulty / Collision / Combat / Score / Effects
                       ▼
              Canvas 2D + AudioManager
```

- O **jogo não conhece o TikTok**: só a interface `GameActions`.
- Eventos entram numa **fila** e são processados no máximo 20 por quadro;
  tubarões de presentes nascem em ritmo limitado e há teto absoluto na tela —
  rajadas de presentes não travam a LIVE.
- Nomes de usuário são sanitizados; **o texto dos comentários nunca é exibido**
  (só comandos são reconhecidos), evitando conteúdo indesejado na tela.
- O ranking usa `LeaderboardStore` (memória). Para banco de dados, crie outra
  classe com a mesma interface.

### Estrutura

```
src/
  main.ts                 inicialização, modos DEV/STREAM, áudio
  config/                 TODOS os números e textos (gameConfig, liveConfig, audioConfig)
  game/                   Game, GameState, GameLoop, GameActions
  entities/               Player, Shark, MegaShark, Projectile
  systems/                Collision, Spawn, Difficulty, Score, Combat, Effects
  interactions/           types, eventSchema, InteractionManager, Mock/TikTok providers
  store/                  LeaderboardStore (memória)
  ui/                     HUD, EventFeed, Leaderboard, AlertBanner, CallToAction, GameOver, Background, DevPanel
  audio/                  AudioManager (sons sintetizados ou arquivos)
tests/                    Vitest
public/assets/audio/      seus arquivos de som (opcional)
```

## Configuração

| Arquivo | O que tem |
|---|---|
| `src/config/gameConfig.ts` | vida, velocidade, tubarões, dificuldade, limites de spawn, curtidas por caos, cura por seguidor, cooldowns… |
| `src/config/liveConfig.ts` | título, mensagens de chamada (🎁 ENVIE PRESENTES…), mapa de presentes → efeito, comandos de comentário |
| `src/config/audioConfig.ts` | volumes e arquivos de som |

**Presentes reais**: o TikTok tem muitos presentes. Adicione em `liveConfig.gifts`
o identificador que o seu bridge envia (ex. `"galaxy": { tier: "rare", ... }`).
Presentes não mapeados usam `unknownGift` (nível pequeno) — nada quebra.

**Sons**: sem arquivos, todos os sons são gerados pelo navegador. Para trocar,
coloque o arquivo em `public/assets/audio/` e informe em `audioConfig.ts`
(ex.: `hit: { file: "assets/audio/hit.mp3", volume: 0.7, minIntervalMs: 90 }`).
Use apenas sons que você tem direito de usar na transmissão.

## Integração futura com o TikTok

O jogo **não implementa nenhuma API do TikTok** e funciona 100% sem ela.
O `TikTokInteractionProvider` conecta (opcionalmente) a um **bridge** por
WebSocket — um processo separado que você cria depois, usando a forma de acesso
aos eventos da LIVE disponível para você (ferramenta/API oficial liberada para a
sua conta ou um serviço de terceiros, respeitando os termos do TikTok). O bridge
só precisa enviar o JSON normalizado:

```json
{"type":"gift","username":"Ana","gift":"rose","count":1}
{"type":"follow","username":"Ana"}
{"type":"like","amount":15,"username":"Ana"}
{"type":"comment","username":"Ana","message":"ATAQUE"}
```

Para ativar, crie `.env` (copie de `.env.example`):

```
VITE_EVENT_BRIDGE_URL=ws://localhost:8787
```

O provedor reconecta sozinho com espera progressiva; se o bridge cair, o jogo
continua normalmente e o simulador segue funcionando.

**Segurança:** variáveis `VITE_*` ficam visíveis no JavaScript do navegador —
coloque ali **somente a URL**. Tokens, cookies e chaves ficam no bridge
(em variáveis de ambiente dele), nunca no jogo. `.env` está no `.gitignore`.

## Troubleshooting

| Problema | Solução |
|---|---|
| Sem som no navegador | Clique na página uma vez (política de autoplay) |
| Sem som no OBS | Marque "Controlar áudio via OBS" na fonte; verifique o mixer |
| Tela cortada/esticada no OBS | Fonte com 1080×1920 e cena vertical 1080×1920 |
| Botões aparecem na LIVE | Use `?mode=stream` na URL do OBS |
| `npm run dev` diz que a porta está em uso | Feche a outra instância ou mude a porta em `vite.config.ts` |
| Bridge "disconnected" no diagnóstico | Bridge desligado/URL errada — o jogo funciona mesmo assim |
| Emojis aparecem como quadrados | Fonte de emoji ausente no sistema (no Windows o Segoe UI Emoji já vem instalado) |
