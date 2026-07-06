# PRD UI — Plataforma de Campañas de Email Personalizadas con IA

## 1. Objetivo de la UI

Crear una interfaz clara, moderna y fácil de usar para que el usuario pueda importar contactos, revisar datos, generar emails personalizados con IA, configurar SMTP/LLM y enviar campañas sin sentirse abrumado.

La UI debe guiar al usuario paso a paso desde la subida del CSV hasta el envío de la campaña.

## 2. Principios de diseño

La interfaz debe ser:

* Limpia y profesional.
* Fácil de entender para usuarios no técnicos.
* Similar a herramientas SaaS modernas.
* Enfocada en tablas, revisión y acciones claras.
* Con estados visuales para evitar errores antes de enviar emails.
* Diseñada para manejar muchos contactos sin confusión.

## 3. Estructura general de navegación

La aplicación tendrá un layout principal tipo dashboard.

### Sidebar principal

Menú lateral izquierdo:

* Dashboard
* Upload CSV
* Contacts
* Lists
* Campaigns
* Reports
* Settings

### Top Bar

Barra superior con:

* Nombre de la página actual.
* Botón principal según la página.
* Estado rápido de SMTP.
* Estado rápido de AI Provider.
* Menú de usuario.

Ejemplo:

* SMTP: Connected / Not Connected
* AI: Connected / Not Connected

## 4. Dashboard

### Objetivo

Mostrar un resumen rápido del estado de la cuenta.

### Componentes UI

Cards superiores:

* Total Contacts
* Active Lists
* Active Campaigns
* Emails Sent
* Failed Emails
* Pending Reviews

Sección de estado:

* SMTP Status
* AI Provider Status
* Last Campaign Status

Tabla inferior:

* Recent Campaigns
* Status
* Sent
* Failed
* Created Date
* Action: View

### Botones principales

* Upload CSV
* Create Campaign
* Go to Settings

## 5. Upload CSV Page

### Objetivo

Permitir al usuario subir un CSV y comenzar el proceso de importación.

### Componentes UI

Área principal tipo drag & drop:

* “Drop your CSV file here”
* Botón: Upload CSV
* Texto de ayuda: “CSV must include at least one email column.”

Después de subir:

* Nombre del archivo.
* Número de filas detectadas.
* Número de columnas detectadas.
* Botón: Continue to Review

### Estados

* Empty state: no file uploaded.
* Uploading state.
* Upload success.
* Upload error.
* Invalid file format.

### Validaciones visibles

Mostrar errores si:

* El archivo no es CSV.
* No se detecta columna de email.
* El archivo está vacío.
* Hay columnas duplicadas.

## 6. CSV Review Page

### Objetivo

Permitir revisar, corregir y guardar contactos importados.

### Layout recomendado

La página debe tener:

* Header con resumen de importación.
* Tabla editable de contactos.
* Panel lateral o modal para acciones masivas.

### Resumen superior

Cards pequeñas:

* Total Rows
* Valid Emails
* Invalid Emails
* Duplicates
* Unlisted Contacts

### Tabla de contactos

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

* Select all
* Assign selected to list
* Create new list
* Delete selected
* Save contacts

### Estados visuales

Badges:

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

## 7. Contacts Page

### Objetivo

Permitir administrar todos los contactos guardados.

### Componentes UI

Header:

* Título: Contacts
* Botón: Add Contact
* Botón: Import CSV

Filtros:

* Search by name, email or company
* Filter by list
* Filter by status
* Filter by import date

Tabla:

* Checkbox
* Status
* Email
* Name
* Company
* List
* Last Campaign
* Updated Date
* Actions

Acciones:

* View Profile
* Edit
* Delete
* Assign to List
* Mark as Suppressed

### Empty state

Si no hay contactos:

“Upload your first CSV to start building personalized campaigns.”

Botón:

* Upload CSV

## 8. Contact Profile Page

### Objetivo

Mostrar todos los datos de un contacto y su perfil personalizado generado por IA.

### Layout recomendado

Dos columnas:

### Columna izquierda

Contact Details:

* Email
* Name
* Company
* Job Title
* Status
* Lists
* Custom Fields

### Columna derecha

AI Profile:

* AI Summary
* Personalization Notes
* Suggested Subject
* Generated Email
* Review Status

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

## 9. Lists Page

### Objetivo

Permitir crear y administrar listas de contactos.

### Componentes UI

Header:

* Título: Lists
* Botón: Create List

Cards o tabla de listas:

* List Name
* Contacts Count
* Ready Contacts
* Issues
* Last Updated
* Actions

Acciones:

* View List
* Rename
* Delete
* Create Campaign

## 10. List Detail Page

### Objetivo

Auditar contactos dentro de una lista antes de usarlos en una campaña.

### Resumen superior

Cards:

* Total Contacts
* Ready
* Missing Data
* Invalid Emails
* Pending Approval

### Tabla

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

## 11. Campaigns Page

### Objetivo

Mostrar todas las campañas creadas.

### Componentes UI

Header:

* Título: Campaigns
* Botón: Create Campaign

Tabla:

* Campaign Name
* List
* Status
* Total Emails
* Sent
* Failed
* Pending
* Created Date
* Actions

Estados:

* Draft
* Generating
* Pending Review
* Ready to Send
* Sending
* Paused
* Completed
* Failed

Acciones:

* View
* Edit
* Pause
* Resume
* Duplicate
* Delete

## 12. Create Campaign Flow

### Objetivo

Crear una campaña en pasos simples.

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

Botón:

* Generate Emails

### Step 3 — Review Emails

Tabla o lista de emails generados:

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

Botón:

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

Ejemplo visible:

“Emails will be sent randomly every 3 to 8 minutes.”

Botón:

* Start Campaign

### Step 5 — Confirmation

Mostrar resumen final:

* Campaign name
* List selected
* Total approved emails
* Sending frequency
* SMTP status
* AI provider used

Botón final:

* Confirm & Start Sending

## 13. Campaign Review Page

### Objetivo

Permitir revisar todos los emails antes de enviar.

### Layout recomendado

Lista izquierda:

* Contact name
* Email
* Status

Panel derecho:

* Subject
* Email Body
* Personalization Notes
* AI Model Used
* Approval Status

Acciones:

* Edit Email
* Regenerate Email
* Regenerate Subject
* Approve
* Skip Contact

## 14. Campaign Detail Page

### Objetivo

Ver el progreso de una campaña.

### Componentes UI

Resumen superior:

* Status
* Total Emails
* Sent
* Failed
* Pending
* Skipped

Progress bar:

* Percentage completed

Tabla de envíos:

* Contact
* Subject
* Status
* Sent At
* Error
* Actions

Acciones:

* Pause Campaign
* Resume Campaign
* Retry Failed
* Cancel Campaign

## 15. Settings Page

### Objetivo

Centralizar las configuraciones necesarias para que el sistema funcione.

La página debe estar dividida en tabs.

### Tabs sugeridos

* SMTP Settings
* AI Settings
* Sending Limits
* Account Settings

## 16. SMTP Settings UI

Campos:

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

Botones:

* Save SMTP Settings
* Test SMTP Connection
* Send Test Email

Estados:

* Connected
* Not Connected
* Connection Failed
* Missing Required Fields

## 17. AI Settings UI

Campos:

* AI Provider
* LLM Model
* API Key
* Default Language
* Default Tone
* Default Email Length
* Enable Subject Generation
* Enable Profile Generation
* Enable Email Generation

Proveedores sugeridos:

* OpenAI
* Anthropic
* Google Gemini
* OpenRouter
* Custom Provider

Botones:

* Save AI Settings
* Test AI Connection

Estados:

* Connected
* Not Connected
* Invalid API Key
* Provider Error
* Model Not Available

Nota UI:

La API Key debe mostrarse oculta después de guardarse.

Ejemplo:

••••••••••••••••1234

## 18. Reports Page

### Objetivo

Mostrar resultados básicos de campañas.

### Componentes UI

Filtros:

* Campaign
* Date range
* Status

Cards:

* Sent
* Failed
* Pending
* Unsubscribed
* Skipped

Tabla:

* Campaign
* Contact
* Email
* Status
* Sent Date
* Error Message

## 19. Componentes globales

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

* Edit contact
* Delete confirmation
* Create list
* Test email
* Confirm campaign start
* Regenerate email

### Toast notifications

Usar notificaciones rápidas para:

* Contact saved
* CSV uploaded
* SMTP connected
* AI connection successful
* Campaign started
* Email regenerated
* Error occurred

## 20. Estados vacíos

Cada página debe tener empty states claros.

Ejemplos:

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

## 21. Estados de error

La UI debe mostrar errores claros y accionables.

Ejemplos:

* “SMTP connection failed. Check your host, port, username and password.”
* “AI provider failed. Please verify your API Key.”
* “This campaign cannot start because 12 emails are not approved.”
* “5 contacts have invalid email addresses.”

## 22. Reglas UX importantes

* No permitir iniciar campaña sin emails aprobados.
* No permitir enviar si SMTP no está conectado.
* No permitir generar emails si AI Provider no está configurado.
* Mostrar confirmación antes de iniciar una campaña.
* Mostrar confirmación antes de eliminar contactos o listas.
* Permitir guardar drafts.
* Permitir pausar campañas activas.
* Mantener visible el estado SMTP y AI en el dashboard.
* Guiar al usuario con pasos claros.

## 23. Estilo visual recomendado

### Diseño general

* SaaS moderno.
* Fondo claro.
* Sidebar limpia.
* Cards con bordes suaves.
* Tablas legibles.
* Botones claros.
* Badges de estado.
* Mucho espacio visual.

### Colores sugeridos

* Background: #F8FAFC
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

## 24. Responsive Design

La UI debe funcionar en desktop y tablet.

Prioridad del MVP:

* Desktop first.
* Tablet compatible.
* Mobile limitado para visualización básica.

En mobile:

* Sidebar colapsada.
* Tablas convertidas en cards.
* Acciones principales visibles.

## 25. MVP UI

La primera versión de UI debe incluir:

* Login básico.
* Dashboard.
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

## 26. Criterios de éxito de UI

La UI será exitosa si el usuario puede:

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
