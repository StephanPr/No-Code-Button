import { ButtonRegistrationForm } from "./Base_Cases/NoCodeButtonFormBase";
import { BaseHelper } from "./Helpers/BaseHelper";
import { ExceptionNoCodeButton } from "./Exceptions/ButtonException";
import { ButtonRegistrationGrid } from "./Base_Cases/NoCodeButtonGridBase";

export class ButtonRegistration {
  static onClick(context: Xrm.FormContext | Xrm.Controls.GridControl, buttonSettingName: string) {
    if (!context) {
      ExceptionNoCodeButton.displayGenericErrorNotification("Registration Error", "No context provided");
      return;
    }
    if (!buttonSettingName) {
      ExceptionNoCodeButton.displayGenericErrorNotification("Registration Error", "No button setting name provided");
      return;
    }
    const baseHelper = new BaseHelper();
    baseHelper.getButtonLocation(context);
    switch (baseHelper.containerType!) {
      case "form":
        ButtonRegistrationForm.onClick(context as Xrm.FormContext, buttonSettingName);
        break;
      case "grid":
      case "subgrid":
        ButtonRegistrationGrid.onClick(context as Xrm.Controls.GridControl, buttonSettingName);
        break;
      default:
        console.log("Unknown button location");
        break;
    }
  }
}
