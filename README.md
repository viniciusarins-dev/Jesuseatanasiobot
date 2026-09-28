# WIN Trading Bot — B3 / Mini-índice

Sistema em Python 3.11+ para análise, backtest, paper trading e (somente após
validação) execução do mini-índice **WIN** da B3 via **MetaTrader 5**.

> **Aviso.** Este projeto é infraestrutura de testes e operação. Nenhuma
> afirmação de lucratividade é feita. Operar futuros envolve risco de perda
> superior ao capital alocado. Use por sua conta e risco.

## Status do desenvolvimento

| Fase | Conteúdo | Status |
|---|---|---|
| 1 — Dados | config, logs, MT5Client (somente leitura), símbolo, candles, ticks, validação, reconexão, histórico | **implementada** |
| 2 — Backtest | engine, FillModel, custos, slippage, métricas, equity | pendente |
| 3 — Estratégia | Strategy, indicadores, MA + VWAP + Volume | pendente |
| 4 — Relatórios / walk-forward | IR, gráficos, treino/validação/teste | pendente |
| 5 — Risco | RiskManager, position sizing, estado diário | pendente |
| 6 — Paper | integração em tempo real + SQLite | pendente |
| 7 — Telegram | mensagens, outbox, deduplicação | pendente |
| 8 — Live execution | guard, execução MT5, kill switch, reconciliação | pendente |

**Na versão atual não existe nenhuma função de envio de ordens.**

## 1. Instalação

Requisitos: **Windows** (a biblioteca oficial `MetaTrader5` só existe para
Windows), Python 3.11+ e o terminal MetaTrader 5 da sua corretora.

```powershell
python --version                 # 3.11 ou superior
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Em Linux/macOS é possível rodar os testes e o backtest (sem MT5); a
dependência `MetaTrader5` é ignorada automaticamente fora do Windows.

## 2. MetaTrader 5 e corretora

1. Instale o MT5 da sua corretora e faça login na conta (demo primeiro).
2. Em *Ferramentas → Opções → Expert Advisors*, habilite **Algo Trading**
   (necessário só na fase de execução; leitura de dados não precisa).
3. Descubra no *Market Watch* o **nome exato** do contrato WIN usado pela
   corretora (contrato vigente, ex. `WINV26`, ou série contínua, ex. `WIN$`).
   Série contínua serve para histórico; **execução exige o contrato vigente**.

## 3. Configuração

### `.env` (segredos — nunca commitar)

```powershell
copy .env.example .env
```

Preencha `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER` (opcionais se o terminal já
estiver logado — se informados, o sistema confere se a conta conectada é a
mesma) e `MT5_TERMINAL_PATH` se houver mais de um terminal instalado.
Nenhum desses valores aparece em logs: o logger mascara segredos e tokens.

### `config.yaml`

Valores `"[PREENCHER]"` são informações reais que o sistema **não supõe**.
Enquanto vazios, as funcionalidades que dependem deles recusam operar.

Necessários já na Fase 1:

| Chave | O que informar | Como descobrir |
|---|---|---|
| `market.symbol` | nome exato do ativo | Market Watch do MT5 |
| `market.server_utc_offset_hours` | fuso do **servidor** MT5 | ver abaixo |
| `market.tick_size` | variação mínima de preço | especificação do contrato (B3) / smoke test |
| `market.tick_value` | valor financeiro de 1 tick por contrato, na moeda da conta | especificação do contrato / smoke test |

O sistema **confere** `tick_size` e `tick_value` com o que o MT5 informa;
divergência = não operar.

**Fuso do servidor.** O MT5 entrega horários no relógio do servidor da
corretora, não em UTC. Um valor errado desloca sessão, VWAP e fechamento de
candle. Rode o smoke test: se ele indicar defasagem de ~N horas, ajuste o
offset. Se a corretora mudar o fuso do servidor (horário de verão), atualize.

Validações de segurança já ativas no carregamento:

* `execution.max_contracts` > 1 → o sistema **aborta** (teto absoluto desta versão).
* `execution.mode: LIVE_EXECUTION` com `allow_real_orders: false` → aborta.
* `allow_real_orders: true` em outro modo → ignorado com aviso.
* Tipos errados, valores fora de faixa, sessão incoerente → aborta.

## 4. Smoke test do MT5 (Windows, somente leitura)

Com o terminal aberto e logado:

```powershell
python -m scripts.mt5_smoke_test
python -m scripts.mt5_smoke_test --export-days 30   # também exporta histórico M5
```

Ele mostra: conexão e modo de margem da conta, as checagens do símbolo, o
último tick e a defasagem de relógio, os últimos candles M1/M5 (o último pode
estar em formação e é descartado), problemas de dados (gaps, duplicados),
posições/ordens abertas (só contagem) e, opcionalmente, exporta
`data/historical/<símbolo>_<timeframe>.csv` + `.meta.json`.

Fora do horário de pregão o tick fica "velho" e o snapshot aparece como não
utilizável — é o comportamento esperado (falha segura).

## 5. Regras da camada de dados

* **Candle fechado**: abertura `t` só é considerada fechada quando
  `t + timeframe <= hora do último tick fresco`. Sem tick fresco, nada é
  considerado fechado e nenhum sinal pode ser gerado.
* **Validação**: OHLC coerente, preços > 0, volume ≥ 0, timestamps alinhados
  ao timeframe, sem futuro, duplicados idênticos removidos, duplicados
  conflitantes = erro, gaps intradiários detectados
  (`data.block_on_gaps: true` bloqueia sinais enquanto houver gap na janela).
* **Volume**: `market.volume_type` escolhe `real_volume` ou `tick_volume`.
  Se a corretora não fornece o volume escolhido (coluna zerada) = erro.
* **Reconexão**: backoff progressivo (`data.reconnect`). Durante falha o
  estado é DEGRADED/DISCONNECTED e nenhuma nova operação é permitida; após
  reconectar, o estado exige reconciliação antes de liberar operações.
* **Horários**: armazenamento em UTC; sessão avaliada em `market.timezone`.

## 6. Dados históricos

Formato canônico CSV (`time` em UTC ISO-8601):

```
time,open,high,low,close,tick_volume,real_volume,spread
2026-09-01T13:00:00+00:00,120000,120020,119990,120005,100,50,1
```

O arquivo `.meta.json` ao lado registra símbolo, timeframe, offset usado e a
data da exportação. O carregador recusa arquivo com timeframe/símbolo
divergente, horário sem timezone ou dados inválidos.

## 7. Testes

```bash
python -m pytest
```

Os testes usam `tests/fakes/fake_mt5.py` e não precisam do MT5. Incluem
testes de arquitetura: `core/`, `strategies/`, `risk/` e `indicators/` não
podem importar MT5/Telegram/SQLite/execução, e somente
`app/data/mt5_client.py` conhece a biblioteca `MetaTrader5`.

## 8. Estrutura

```
app/
  config/settings.py      carga e validação de config.yaml + .env
  core/                   tipos, enums e erros (Python puro)
  data/                   MT5Client, símbolo, candles, ticks, validação, reconexão, histórico
  utils/                  logger (mascaramento de segredos), time_utils (fusos)
  indicators/ strategies/ backtest/ risk/ execution/ notifier/ live/ database/   (próximas fases)
scripts/mt5_smoke_test.py
tests/
```

## 9. Troubleshooting

| Sintoma | Causa provável |
|---|---|
| `Biblioteca MetaTrader5 indisponível` | Não está no Windows ou `pip install MetaTrader5` não foi feito |
| `Falha ao inicializar o MT5 ... No IPC connection` | Terminal fechado, caminho errado em `MT5_TERMINAL_PATH`, ou Python e MT5 com arquiteturas diferentes (use 64 bits) |
| `A conta conectada no terminal difere de MT5_LOGIN` | O terminal está logado em outra conta |
| `symbol_not_found` | Nome do símbolo diferente na sua corretora |
| `tick_value_mismatch` / `tick_size_mismatch` | `config.yaml` não bate com o MT5 — confira a especificação |
| `clock_skew` / defasagem de ~N horas | `market.server_utc_offset_hours` incorreto |
| `stale_tick` | Mercado fechado, leilão, ou feed congelado |
| `volume_unavailable` | Corretora não fornece `real_volume`: use `volume_type: tick` |
| `Timezone desconhecido` no Windows | `pip install tzdata` |
