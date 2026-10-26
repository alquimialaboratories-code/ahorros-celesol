---
name: Histórico de ahorros
description: Consulta de cuentas cerradas en tonos grises (solo lectura) + vista resumen analítico con KPIs, gráfico capital/intereses por año, insight IA y envío de PDF al email del socio
type: feature
---
La sección Históricos tiene dos vistas:
1. **Tabla** (default): cuentas cerradas en tonos grises, solo lectura, sin botón Renovar.
2. **Resumen analítico** (combo "wow"): se accede con el botón "Ver resumen analítico" en la parte superior derecha de la tabla. Incluye:
   - 4 KPIs: Ahorros cerrados, Capital invertido, Intereses generados, Antigüedad como ahorrista (con fecha del primer ahorro).
   - Gráfico de barras anual (recharts) con capital e intereses lado a lado, agrupado por año de vencimiento.
   - Insight IA generado por edge function `generar-insight-historico` (Lovable AI Gateway, modelo `google/gemini-3-flash-preview`), tono mixto cálido + analítico, máx 4 oraciones, en español rioplatense.
   - Botón "Enviar PDF a mi email": llama a edge function `enviar-resumen-historico-email`, que genera PDF server-side con jsPDF + jspdf-autotable y lo envía vía SMTP. El email reusa la estética del OTP (mismo header verde con logo, mismo card blanco, footer Red Unisol). Rate limit: 3 envíos por DNI cada 30 min vía `email_send_log` con `tipo = 'resumen-historico'`.

Componente: `src/components/HistoricoResumen.tsx`. Integración en `src/components/ResultsStep.tsx` con estado `historicoVista: "tabla" | "resumen"` y early return cuando es "resumen".
