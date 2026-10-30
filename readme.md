# Low Code Button Documentation

> **⚠️ Project Under Revision**  
> This project is currently under revision and will be modified soon. The entity model is to be updated, so expect major changes in the upcoming release. No bugs were detected within this release, and we have received very valuable feedback from multiple organizations that are using this open-source tool. We have already started implementing the changes. You can continue to use the solution as of today, but expect new changes coming up.

## Overview

Low Code Button (LCB) is a lightweight and customizable tool designed to empower Developers, Consultants, and Citizen Developers to easily bridge Dynamics 365 Ribbon Bar buttons to Power Automate flows. This managed solution provides an intuitive interface, enabling the seamless integration and management of interactive buttons directly within your Dynamics 365 environment.

Watch the demo [here](https://youtu.be/fgtiu2bTYZk).

---

## Key Benefits

- **Empowerment:** Allows Developers, Consultants, and Citizen Developers to independently configure button integrations without extensive coding.
- **Flexibility:** Supports various button types, execution modes, and dynamic payloads.
- **Integration:** Seamlessly connects the Dynamics 365 Ribbon Bar to Power Automate.

---

## Installation and Setup

### Download and Import

1. **Download the latest managed solution** from the [releases section](https://github.com/LagoESP/LowCodeButton/releases).

2. **Import the solution** into Dynamics 365:

- Recommended: navigate to [make.powerapps.com](https://make.powerapps.com), go to **Solutions**, and import the downloaded managed solution.
- Alternatively, import it from **Settings > Solutions** directly within Dynamics 365.

### Security Roles

The solution includes two predefined security roles:

- **LowCodeButtonMaker:** Full permissions for configuring and updating buttons.
- **LowCodeButtonUser:** Limited read-only access, ideal for end users.

Assign these roles appropriately based on user responsibilities.

---

## Configuring Buttons in the LCB Settings App

### Preparing Languages

1. Open the provided model-driven app **LCB (Low Code Button) Settings**.
2. Create the required language entries:
   - Add languages with their corresponding LCID (`esp_lcid`).
   - Ensure the `LCID` is unique, as it serves as an alternate key.

![Languages Setup](https://github.com/user-attachments/assets/b7f1b7d8-0bad-4cf1-a81a-f38a31bde474)

### Button Settings

1. Within the **LCB (Low Code Button) Settings** app, navigate to **Button Settings**.
2. Create new button entries:
   - Specify a unique **Button Name** (`esp_buttoname`) as this serves as an alternate key and is how the button is referenced later.
   - Provide the **Endpoint** and configure the required payload and refresh options.
   - Select the button type in the header. Currently supported button types are **Form**, **Grid** and **Subgrid**.

> **Note:** Associated Views are currently not supported.

> **⚠️ Important:** Ensure the **Button Location** selected on the Button Setting form matches the location of the button in the Ribbon Bar. If you need a button in more than one location (form, grid, subgrid), you must register a separate button for each location.

![Button Settings](https://github.com/user-attachments/assets/217f16b6-9d62-437a-9c30-faf3bab41b75)

### Advanced Button Settings

Once the Button Setting exists, configure its additional behaviour per language:

1. Select your button in the subgrid.
2. Click **New Advanced Button Setting** and configure:
   - **Execution Mode** (Sync / Async).
   - **Confirmation Dialogs**, **Spinners**, and the various **Notifications**.

![Advanced Settings](https://github.com/user-attachments/assets/016d59c2-6b00-4f28-a674-3514d96a33d1)

---

## Ribbon Integration

### Command Bar Designer (Recommended)

Low Code Button is fully compatible with the new Dynamics 365 Command Bar Designer, which is recommended for ease of use and flexibility.

1. Open **Command Bar Designer** within your Dynamics 365 environment.
2. Select the form, grid, or subgrid where the button will be displayed.
3. Add a new command:
   - Reference the provided JavaScript web resource: `LowCodeButtonBase.js` (`esp_/js/LowCodeButtonBase.js`).
   - Always use the function: `LCB.ButtonRegistration.onClick`.
4. Set the parameters based on the button location:
   - **Form**: use `PrimaryControl` (formContext) as the first parameter. *(Important: do NOT use `SelectedControl` for forms.)*
   - **Grid or Subgrid**: use `SelectedControl` as the first parameter. *(Important: do NOT use `PrimaryControl` for grids/subgrids.)*
   - Use the exact **Button Name** (`esp_buttoname`) defined earlier as the second parameter, as a string.

### Visibility Rules

Visibility rules can be configured directly in Command Bar Designer using Power Fx formulas, without any additional JavaScript.

### Ribbon Workbench (Alternative)

Although the Command Bar Designer is recommended, Low Code Button remains fully compatible with the classic Ribbon Workbench.

---
## Payload Customization

Using **Button Settings**, you can customize the payload to include only the necessary data and leave out what your flow does not need.

You can preview the exact JSON payload that will be sent to the endpoint by setting *Show Example Payload* to **Yes**. Copy that example into the HTTP Trigger connector of your Power Automate flow to make its Dynamic Content available to you.

The payload varies with the location the button is configured for (Form or Grid/Subgrid).

### Form Button Payload

Example payload:

```json
{
  "entityLogicalSingularName": "account",
  "entityLogicalPluralName": "accounts",
  "recordId": "b3e1a217-ad08-8191-9023-465306ca391b",
  "userId": "c2f4b618-ad23-7811-b023-9084732ab23f"
}
```

When a button configured for a form is clicked, the payload includes:

- **entityLogicalSingularName**: Singular name of the entity.
- **entityLogicalPluralName**: Plural name of the entity.
- **recordId**: ID of the current form record.
- **userId**: ID of the current user triggering the action.

### Grid or Subgrid Button Payload

Example payload for a Grid:

```json
{
  "entityLogicalName": "contact",
  "entityLogicalPluralName": "contacts",
  "recordIds": [
    "e2a1b318-bf22-8819-a123-568930bd1234",
    "d2a1c417-bc22-7719-b134-468940be5678"
  ],
  "userId": "c2f4b618-ad23-7811-b023-9084732ab23f"
}
```

Example payload for a Subgrid:

```json
{
  "entityLogicalName": "opportunity",
  "entityLogicalPluralName": "opportunities",
  "recordIds": [
    "f4e1d217-cd08-7191-d123-578406ca123c"
  ],
  "userId": "c2f4b618-ad23-7811-b023-9084732ab23f",
  "parentEntityLogicalName": "account",
  "parentEntityLogicalPluralName": "accounts",
  "parentRecordId": "b3e1a217-ad08-8191-9023-465306ca391b"
}
```

For grid or subgrid button clicks, the payload includes:

- **entityLogicalName**: Logical name of the entity from the grid or subgrid.
- **entityLogicalPluralName**: Plural name of the entity.
- **recordIds**: IDs of the selected records. At least one record must be selected in a grid or subgrid; otherwise the button click triggers the default exception and no POST request is sent to the API.
- **userId**: ID of the current user triggering the action.

Additionally, a subgrid payload can include:

- **parentEntityLogicalName** and **parentEntityLogicalPluralName**: Details about the parent form.
- **parentRecordId**: ID of the parent record.

These payload configurations provide context to the backend action, making the integration robust and context-aware.

---

## Response Types

Response types are relevant only for buttons configured with **sync** execution mode. For buttons configured with **async** execution mode, Low Code Button only checks for DNS issues or an incorrect URI and does not process the response returned by the flow.

Async mode strictly follows the "Fire and Forget" approach: the request is initiated without waiting for any response or acknowledgment from the flow, which keeps the wait time for the user to a minimum.

Depending on your needs, Low Code Button supports the following responses:

### Successful Execution (No Redirect)

If your flow finishes successfully and you do not want to redirect the user, simply respond with a plain HTTP 200 response.

### Successful Execution with Redirect

To redirect the user after a successful execution:

- Set the **Sync Confirmation Box Type** to **Redirect** in the Advanced Button Settings.
- Respond from your API with the following JSON:

```json
{
  "redirectUri": "https://www.example.com"
}
```

> **Important:** Ensure the redirect URI includes **https:// or http://**.

### Error Handling

Low Code Button handles exceptions automatically:

- **5xx Responses:** The user sees the status code and the error message directly.
- **Custom Error Handling (400 Response):** To surface your own error message, respond with:

```json
{
  "title": "Error Title",
  "message": "Something went wrong"
}
```

> The `title` field is optional but recommended for clarity.

---

## Contributing

Contributions are welcome:

1. Fork and branch.
2. Commit clearly.
3. Submit a pull request.

---

## License

Licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike (CC BY-NC-SA) License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

**Why this license?**

1. **Public Accessibility:** Allows the Dynamics 365 community free access and usage.
2. **Professional Usage:** Companies can freely incorporate it into their internal solutions, but cannot commercialize it separately as a paid addon.
3. **Modification and Redistribution:** Others can modify and redistribute the solution freely, provided they attribute the original work and do not commercialize it.

---

## Support

For support, contact:

- **José Martínez Lago**: [LinkedIn](https://www.linkedin.com/in/martinezlago/) | [jose@lago.dev](mailto:jose@lago.dev)
- **Stephan Charles**: [LinkedIn](https://www.linkedin.com/in/stephan-charles-nielson/)

