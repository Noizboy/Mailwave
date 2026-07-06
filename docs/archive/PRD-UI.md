# PRD UI — Plataforma Dashboard de Campañas de Email Personalizadas con IA

## 1. Objetivo de la UI

Crear una interfaz tipo dashboard SaaS para que el usuario pueda importar contactos, revisar datos, crear listas, generar emails personalizados con IA, configurar SMTP/LLM y enviar campañas desde una experiencia clara, organizada y profesional.

La UI debe estar basada en:

* Sidebar menu fijo.
* Topbar superior.
* Área central de contenido.
* Cards de resumen.
* Tablas editables.
* Flujos paso a paso.
* Estados visuales claros.

## 2. Estructura general del dashboard

La aplicación debe usar un layout principal de dashboard.

### 2.1 Sidebar Menu

El sidebar estará ubicado en el lado izquierdo y será la navegación principal de la aplicación.

Opciones del sidebar:

* Dashboard
* Upload CSV
* Contacts
* Lists
* Campaigns
* Reports
* Settings

Opciones secundarias opcionales:

* Help
* Billing
* Logout

### 2.2 Topbar

La topbar estará ubicada en la parte superior del área principal.

Debe incluir:

* Nombre de la página actual.
* Breadcrumb opcional.
* Botón principal según la página.
* Estado rápido de SMTP.
* Estado rápido de AI Provider.
* Notificaciones.
* Menú de usuario.

Ejemplo de estados rápidos:

* SMTP Connected
* SMTP Not Connected
* AI Connected
* AI Not Connected

### 2.3 Área principal de contenido

El contenido principal se mostrará a la derecha del sidebar y debajo de la topbar.

Debe incluir:

* Header de página.
* Cards de métricas.
* Tablas.
* Formularios.
* Modals.
* Flujos paso a paso.

## 3. Principios de diseño

La UI debe ser:

* Limpia.
* Moderna.
* Tipo SaaS.
* Fácil de entender.
* Desktop-first.
* Enfocada en productividad.
* Preparada para manejar muchos contactos.
* Clara al mostrar errores, estados y acciones pendientes.

El usuario debe saber en todo momento:

* Qué está configurado.
* Qué falta por configurar.
* Qué contactos tienen problemas.
* Qué emails están aprobados.
* Si una campaña está lista para enviar.

## 4. Navegación principal

### Sidebar Menu

El sidebar debe tener íconos y texto.

Estructura recomendada:

1. Dashboard
2. Upload CSV
3. Contacts
4. Lists
5. Campaigns
6. Reports
7. Settings

El item activo debe mostrarse visualmente resaltado.

### Topbar global

Elementos recomendados:

* Page Title
* Search opcional
* SMTP status badge
* AI status badge
* Create button contextual
* User profile dropdown

Ejemplo:

Página: Contacts
Botón principal: Import CSV
Estados: SMTP Connected / AI Connected

## 5. Dashboard Page

### Objetivo

Mostrar el resumen general de la cuenta y el estado operativo del sistema.

### Layout

La página debe usar:

* Header superior.
* Cards de métricas.
* Sección de estado del sistema.
* Tabla de campañas recientes.

### Cards superiores

* Total Contacts
* Active Lists
* Active Campaigns
* Emails Sent
* Failed Emails
* Pending Reviews

### System Status

Mostrar dos cards principales:

* SMTP Status
* AI Provider Status

Cada una debe indicar:

* Connected / Not Connected
* Última prueba realizada
* Botón rápido para ir a Settings

### Recent Campaigns Table

Columnas:

* Campaign Name
* Status
* Sent
* Failed
* Pending
* Created Date
* Action

### Botones principales

* Upload CSV
* Create Campaign
* Go to Settings

## 6. Upload CSV Page

### Objetivo

Permitir al usuario subir un archivo CSV para importar contactos.

### Layout

Dentro del dashboard, esta página debe mostrar:

* Header: Upload CSV
* Card central de upload
* Instrucciones breves
* Validaciones

### Componentes UI

Card de upload:

* Drag & drop area
* Botón: Upload CSV
* Texto: “CSV must include at least one email column.”

Después de subir:

* Nombre del archivo
* Total rows detected
* Total columns detected
* Botón: Continue to Review

### Estados

* Empty state
* Uploading
* Upload success
* Upload error
* Invalid file format

### Errores visibles

* Archivo no es CSV.
* No se detectó columna de email.
* Archivo vacío.
* Columnas duplicadas.
* Formato inválido.

## 7. CSV Review Page

### Objetivo

Permitir revisar, corregir y guardar contactos importados desde el CSV.

### Layout

La página debe tener:

* Header con resumen de importación.
* Cards de validación.
* Tabla editable.
* Acciones masivas.

### Cards superiores

* Total Rows
* Valid Emails
* Invalid Emails
* Duplicates
* Unlisted Contacts

### Tabla editable

Columnas sugeridas:

* Checkbox
* Status
* Email
* First Name
* Last Name
* Company
* Job Title
* Custom Fields
* List
* Actions

### Acciones por contacto

* Edit
* Delete
* Assign to List
* Mark as Unlisted

### Acciones masivas

* Select All
* Assign Selected to List
* Create New List
* Delete Selected
* Save Contacts

### Estados visuales

Usar badges:

* Valid
* Invalid Email
* Duplicate
* Missing Data
* Unlisted
* Ready

### Botones principales

* Save Contacts
* Create List & Save
* Cancel Import

## 8. Contacts Page

### Objetivo

Administrar todos los contactos guardados.

### Layout

Página tipo dashboard con:

* Header
* Barra de filtros
* Tabla de contactos
* Acciones masivas

### Header

Título: Contacts

Botones:

* Add Contact
* Import CSV

### Filtros

* Search by name, email or company
* Filter by list
* Filter by status
* Filter by import date

### Tabla

Columnas:

* Checkbox
* Status
* Email
* Name
* Company
* List
* Last Campaign
* Updated Date
* Actions

### Acciones

* View Profile
* Edit
* Delete
* Assign to List
* Mark as Suppressed

### Empty state

Texto:

“No contacts yet. Upload a CSV to get started.”

Botón:

* Upload CSV

## 9. Contact Profile Page

### Objetivo

Mostrar el perfil completo de un contacto y su personalización generada con IA.

### Layout

Usar una vista de dos columnas dentro del dashboard.

### Columna izquierda: Contact Details

Debe mostrar:

* Email
* Name
* Company
* Job Title
* Status
* Lists
* Custom Fields

### Columna derecha: AI Profile

Debe mostrar:

* AI Summary
* Personalization Notes
* Suggested Subject
* Generated Email
* Review Status
* AI Provider Used
* LLM Model Used

### Acciones

* Edit Contact
* Regenerate AI Profile
* Regenerate Subject
* Regenerate Email
* Approve Email
* Save Changes

### Estados

* AI Profile Not Generated
* Pending Review
* Approved
* Missing Data
* Error Generating

## 10. Lists Page

### Objetivo

Crear y administrar listas de contactos.

### Layout

Vista tipo dashboard con:

* Header
* Botón principal
* Cards o tabla de listas

### Header

Título: Lists

Botón:

* Create List

### Tabla o cards de listas

Campos:

* List Name
* Contacts Count
* Ready Contacts
* Issues
* Last Updated
* Actions

### Acciones

* View List
* Rename
* Delete
* Create Campaign

## 11. List Detail Page

### Objetivo

Auditar contactos dentro de una lista antes de crear una campaña.

### Layout

Debe mostrar:

* Header de la lista.
* Cards de resumen.
* Tabla de contactos.
* Acciones para generar perfiles o emails.

### Cards superiores

* Total Contacts
* Ready
* Missing Data
* Invalid Emails
* Pending Approval

### Tabla

Columnas:

* Status
* Email
* Name
* Company
* AI Profile Status
* Email Status
* Actions

### Botones principales

* Generate AI Profiles
* Generate Emails
* Create Campaign
* Export Issues

### Estados visuales

* Ready
* Needs Review
* Invalid
* Missing Data
* Email Not Generated
* Approved

## 12. Campaigns Page

### Objetivo

Mostrar y administrar todas las campañas.

### Layout

Página con:

* Header
* Botón principal
* Filtros
* Tabla de campañas

### Header

Título: Campaigns

Botón:

* Create Campaign

### Filtros

* Status
* Date range
* List
* Search campaign

### Tabla

Columnas:

* Campaign Name
* List
* Status
* Total Emails
* Sent
* Failed
* Pending
* Created Date
* Actions

### Estados

* Draft
* Generating
* Pending Review
* Ready to Send
* Sending
* Paused
* Completed
* Failed

### Acciones

* View
* Edit
* Pause
* Resume
* Duplicate
* Delete

## 13. Create Campaign Flow

### Objetivo

Crear una campaña mediante un flujo guiado dentro del dashboard.

El flujo debe sentirse como un wizard de varios pasos.

### Step 1 — Campaign Details

Campos:

* Campaign Name
* Select Contact List
* Campaign Goal
* Product or Service
* CTA

Botón:

* Continue

### Step 2 — AI Instructions

Campos:

* Tone
* Language
* Email Length
* Extra Instructions
* Generate Subject Lines: On/Off
* Generate Email Body: On/Off

Mostrar también:

* AI Provider selected
* LLM Model selected

Botón:

* Generate Emails

### Step 3 — Review Emails

Mostrar tabla o lista de emails generados.

Columnas:

* Contact
* Subject
* Email Preview
* Status
* Actions

Acciones:

* View Full Email
* Edit
* Regenerate
* Approve
* Reject

Botones:

* Approve All Valid
* Continue to Sending Settings

### Step 4 — Sending Settings

Campos:

* Start Date
* Start Time
* Interval Type: Fixed / Random
* Minimum Interval
* Maximum Interval
* Daily Limit
* Hourly Limit

Texto de ayuda:

“Emails will be sent randomly every 3 to 8 minutes.”

Botón:

* Continue to Confirmation

### Step 5 — Confirmation

Mostrar resumen final:

* Campaign Name
* Selected List
* Total Approved Emails
* Sending Frequency
* SMTP Status
* AI Provider Used
* LLM Model Used

Botón final:

* Confirm & Start Sending

## 14. Campaign Review Page

### Objetivo

Revisar cada email generado antes del envío.

### Layout

Usar layout dividido:

* Lista de contactos a la izquierda.
* Preview del email a la derecha.

### Lista izquierda

Debe mostrar:

* Contact name
* Email
* Status

### Panel derecho

Debe mostrar:

* Subject
* Email Body
* Personalization Notes
* AI Provider Used
* LLM Model Used
* Approval Status

### Acciones

* Edit Email
* Regenerate Email
* Regenerate Subject
* Approve
* Skip Contact

## 15. Campaign Detail Page

### Objetivo

Ver el progreso de una campaña activa o completada.

### Layout

Página con:

* Header de campaña.
* Cards de métricas.
* Progress bar.
* Tabla de envíos.
* Acciones de campaña.

### Cards superiores

* Total Emails
* Sent
* Failed
* Pending
* Skipped

### Progress bar

Debe mostrar:

* Porcentaje completado.
* Estado actual.
* Próximo email estimado, si aplica.

### Tabla de envíos

Columnas:

* Contact
* Subject
* Status
* Sent At
* Error
* Actions

### Acciones principales

* Pause Campaign
* Resume Campaign
* Retry Failed
* Cancel Campaign

## 16. Settings Page

### Objetivo

Centralizar la configuración del sistema.

La página debe estar dentro del dashboard y organizada en tabs.

### Tabs sugeridos

* SMTP Settings
* AI Settings
* Sending Limits
* Account Settings

## 17. SMTP Settings UI

### Campos

* SMTP Host
* SMTP Port
* Username
* Password / App Password
* From Name
* From Email
* Reply-To Email
* Encryption Type
* Daily Limit
* Hourly Limit

### Botones

* Save SMTP Settings
* Test SMTP Connection
* Send Test Email

### Estados

* Connected
* Not Connected
* Connection Failed
* Missing Required Fields

### Reglas UI

* Ocultar password después de guardarlo.
* Mostrar errores claros.
* No permitir enviar campañas si SMTP no está conectado.

## 18. AI Settings UI

### Campos

* AI Provider
* LLM Model
* API Key
* Default Language
* Default Tone
* Default Email Length
* Enable Subject Generation
* Enable Profile Generation
* Enable Email Generation

### Proveedores sugeridos

* OpenAI
* Anthropic
* Google Gemini
* OpenRouter
* Custom Provider

### Botones

* Save AI Settings
* Test AI Connection

### Estados

* Connected
* Not Connected
* Invalid API Key
* Provider Error
* Model Not Available

### Reglas UI

* Ocultar API Key después de guardarla.
* Mostrar el proveedor activo en la topbar.
* Mostrar el modelo activo en Campaign Review.
* No permitir generar emails si AI Provider no está configurado.

Ejemplo visual de API Key guardada:

••••••••••••••••1234

## 19. Reports Page

### Objetivo

Mostrar resultados básicos de campañas.

### Layout

Página tipo dashboard con:

* Cards de métricas.
* Filtros.
* Tabla de resultados.

### Filtros

* Campaign
* Date range
* Status

### Cards

* Sent
* Failed
* Pending
* Unsubscribed
* Skipped

### Tabla

Columnas:

* Campaign
* Contact
* Email
* Status
* Sent Date
* Error Message

## 20. Componentes globales

### Badges

Usar badges para estados:

* Ready
* Draft
* Approved
* Pending
* Failed
* Invalid
* Unlisted
* Unsubscribed
* Connected
* Not Connected

### Modals

Usar modals para:

* Edit Contact
* Delete Confirmation
* Create List
* Test Email
* Confirm Campaign Start
* Regenerate Email

### Toast Notifications

Usar notificaciones rápidas para:

* Contact saved
* CSV uploaded
* SMTP connected
* AI connection successful
* Campaign started
* Email regenerated
* Error occurred

### Tables

Las tablas deben tener:

* Search
* Filters
* Sorting
* Pagination
* Bulk actions
* Row actions

## 21. Estados vacíos

Cada página debe tener empty states claros.

### Contacts Empty State

“No contacts yet. Upload a CSV to get started.”

Botón:

* Upload CSV

### Campaigns Empty State

“No campaigns created yet. Create your first personalized campaign.”

Botón:

* Create Campaign

### Lists Empty State

“No contact lists yet. Create a list from your imported contacts.”

Botón:

* Create List

## 22. Estados de error

La UI debe mostrar errores claros y accionables.

Ejemplos:

* “SMTP connection failed. Check your host, port, username and password.”
* “AI provider failed. Please verify your API Key.”
* “This campaign cannot start because 12 emails are not approved.”
* “5 contacts have invalid email addresses.”
* “This contact is unsubscribed and cannot receive emails.”

## 23. Reglas UX importantes

* El sidebar debe estar visible en desktop.
* La topbar debe estar visible en todas las páginas internas.
* El estado de SMTP y AI debe estar siempre visible en la topbar.
* No permitir iniciar campaña sin emails aprobados.
* No permitir enviar si SMTP no está conectado.
* No permitir generar emails si AI Provider no está configurado.
* Mostrar confirmación antes de iniciar una campaña.
* Mostrar confirmación antes de eliminar contactos o listas.
* Permitir guardar campañas como draft.
* Permitir pausar campañas activas.
* Mostrar claramente qué paso falta para poder enviar.

## 24. Estilo visual recomendado

### Diseño general

* SaaS moderno.
* Dashboard limpio.
* Sidebar fija.
* Topbar clara.
* Fondo claro.
* Cards con bordes suaves.
* Tablas legibles.
* Botones visibles.
* Badges de estado.
* Mucho espacio visual.

### Colores sugeridos

* Background: #F8FAFC
* Sidebar Background: #0F172A
* Sidebar Text: #CBD5E1
* Sidebar Active: #2563EB
* Cards: #FFFFFF
* Primary: #2563EB
* Success: #16A34A
* Warning: #F59E0B
* Error: #DC2626
* Text Primary: #111827
* Text Secondary: #6B7280
* Border: #E5E7EB

### Tipografía

* Font principal: Inter, system-ui o similar.
* Títulos: semibold.
* Body: regular.
* Tablas: compactas pero legibles.

## 25. Responsive Design

La UI debe ser desktop-first.

### Desktop

* Sidebar fija.
* Topbar completa.
* Tablas completas.
* Layouts de dos columnas disponibles.

### Tablet

* Sidebar colapsable.
* Topbar visible.
* Tablas con scroll horizontal.

### Mobile

* Sidebar convertida en menú hamburguesa.
* Topbar simplificada.
* Tablas convertidas en cards.
* Acciones principales visibles.

El MVP puede priorizar desktop y tablet.

## 26. MVP UI

La primera versión de UI debe incluir:

* Login básico.
* Dashboard layout.
* Sidebar menu.
* Topbar global.
* Dashboard page.
* Upload CSV.
* CSV Review.
* Contacts.
* Contact Profile.
* Lists.
* List Detail.
* Campaigns.
* Create Campaign Flow.
* Campaign Review.
* Campaign Detail.
* Settings con SMTP y AI.
* Reports básicos.

## 27. Criterios de éxito de UI

La UI será exitosa si el usuario puede:

* Entender la navegación desde el sidebar.
* Ver el estado SMTP y AI desde la topbar.
* Subir un CSV sin confusión.
* Revisar contactos fácilmente.
* Detectar errores antes de guardar contactos.
* Crear listas.
* Ver qué contactos están listos o tienen problemas.
* Configurar SMTP.
* Configurar proveedor IA y LLM.
* Crear una campaña paso a paso.
* Revisar y aprobar emails personalizados.
* Ajustar frecuencia de envío.
* Iniciar una campaña con confianza.
* Ver progreso y errores de envío claramente.
