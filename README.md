# Forecast de Compras — PBGroup

Herramienta standalone de planificación de compras para PBGroup (distribuidor de Wella Professionals, Sebastian, OPI, Nioxin en Uruguay).

Procesa el histórico de ventas de Power BI, calcula forecast de demanda con clasificación automática, genera un plan de compras por ventana y origen, y permite guardar sesiones para comparar entre ciclos.

## Módulos

| # | Módulo | Función |
|---|---|---|
| ⊞ | Dashboard | KPIs globales, top quiebres, top valor, cobertura |
| 01 | Histórico | Carga de ventas Power BI, marcado de faltantes/bonificaciones, detección de quiebres |
| 02 | Maestros | Origen, lead time, mínimo, precio, stock actual, seguridad, tránsito, lotes |
| 03 | Forecast | Proyección 18 meses con estacionalidad, tendencia amortiguada, clasificación CV |
| 04 | Plan de Compras | Cantidades por ventana, FEFO, bonif estructural, overrides, revisiones |
| 05 | Alertas | Quiebres proyectados, stock bajo seguridad, erráticos sin revisar, vencimientos |
| 06 | Exportar | Excel con forecast y plan de compras |
| JBP | Resumen Fiscal | Panorama por FY con YoY, mix, ABC, compra vs demanda |

## Stack

- **Frontend:** HTML + CSS + JavaScript vanilla (single-file, ~9100 líneas)
- **Librerías CDN:** [SheetJS](https://sheetjs.com/) (Excel I/O), [LZ-string](https://pieroxy.net/blog/pages/lz-string/) (compresión localStorage)
- **Backend opcional:** Google Apps Script + Google Sheets (sesiones y revisiones)
- **Hosting:** GitHub Pages

## Arquitectura de datos

```
Browser (todo local)
├── Histórico de ventas     ← Excel de Power BI (nunca sale del browser)
├── Stock histórico         ← Excel opcional
├── Maestros/tránsito/lotes ← Excel o edición manual
├── Forecast calculado      ← en memoria (JS)
├── Plan de compras         ← en memoria (JS)
└── Sesiones                ← localStorage (comprimido) + Google Sheets (backup)
```

Los archivos de ventas, stock y maestros se procesan 100% del lado del cliente. Nunca se suben a ningún servidor.

## Deploy

### GitHub Pages (recomendado)

1. Crear repo en GitHub (privado o público)
2. Subir `index.html` y `Code.gs`
3. Settings → Pages → Source: `main` branch, folder: `/ (root)`
4. Esperar ~60 segundos → URL disponible en `https://<user>.github.io/<repo>/`

### Google Apps Script (backend)

1. Abrir [Google Apps Script](https://script.google.com/)
2. Crear proyecto nuevo → pegar contenido de `Code.gs`
3. Deploy → Web App → "Cualquiera, incluso anónimos"
4. Copiar la URL del deploy
5. En `index.html`, verificar que `REVISIONES_API` apunte a esa URL

Las hojas de Google Sheets se crean automáticamente al primer uso:
- `Revisiones` — estados de revisión por producto × ciclo
- `FC_Sesiones` — metadata de sesiones guardadas
- `FC_Snapshots` — datos de sesiones (chunked, max 45KB/celda)

## Formato de archivos

### Ventas (obligatorio)

Exportación de Power BI en formato largo:

```
Producto# ; Producto ; #Unidades_Totales ; Mes_Pfiscal ; AñoFiscal ; #Unidades_Bonif ; Marca ; Línea
1404006   ; WCP 6/0  ; 120               ; P01Jul      ; FY25      ; 5               ; WCP   ; Color
```

Soporta CSV (`;` o `,`) y XLSX.

### Stock histórico (opcional)

```
Producto# ; Stock_Cierre ; Mes_Pfiscal ; AñoFiscal
1404006   ; 85           ; P01Jul      ; FY25
```

### Maestros, tránsito, lotes

Templates descargables desde la interfaz (botones ↓ Template).

## Modelo de forecast

- **Regulares** (CV < 0.6): base × estacionalidad × tendencia amortiguada (Gardner & McKenzie, φ=0.90)
- **Erráticos** (CV ≥ 0.6): media simple con intervalo p25-p75
- **Nuevos** (< 6 períodos): media disponible, referencial
- **Outliers**: detección por MAD × 3 + ratio > 2× mediana, interpolación desde otros años
- **Bonificación estructural**: mediana de ratio bonif/total en meses consistentes, aplicada en plan de compras

## Sesiones

Las sesiones guardan el estado completo: marcados, forecast, config (φ, seguridad, años), maestros, quiebres, plan de compras, overrides, revisiones, calendario personalizado y changelog. Se comprimen con LZ-string (~5-8× reducción) y persisten en localStorage + Google Sheets.

Funcionalidades:
- Guardar/cargar sesiones por ciclo (mensual o trimestral)
- Comparar entre sesiones con agrupación por marca/línea y totales
- Importar marcados del histórico desde sesión anterior
- Exportar sesión como JSON
- Validación de completitud al guardar
- Warning de stock desincronizado al restaurar

## Calendario fiscal

PBGroup opera con año fiscal julio → junio:

```
FY27 = Jul 2026 (P01) → Jun 2027 (P12)
P01Jul P02Ago P03Set P04Oct P05Nov P06Dic P07Ene P08Feb P09Mar P10Abr P11May P12Jun
```

## Licencia

Uso interno PBGroup. No distribuir.
