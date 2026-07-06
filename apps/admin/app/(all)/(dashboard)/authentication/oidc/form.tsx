import { useState } from "react";
import { isEmpty } from "lodash-es";
import Link from "next/link";
import { useForm } from "react-hook-form";
// plane internal packages
import { API_BASE_URL } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFormattedInstanceConfiguration, TInstanceOidcAuthenticationConfigurationKeys } from "@plane/types";
// components
import { CodeBlock } from "@/components/common/code-block";
import { ConfirmDiscardModal } from "@/components/common/confirm-discard-modal";
import type { TControllerInputFormField } from "@/components/common/controller-input";
import { ControllerInput } from "@/components/common/controller-input";
import type { TControllerSwitchFormField } from "@/components/common/controller-switch";
import { ControllerSwitch } from "@/components/common/controller-switch";
import type { TCopyField } from "@/components/common/copy-field";
import { CopyField } from "@/components/common/copy-field";
// hooks
import { useInstance } from "@/hooks/store";

type Props = {
  config: IFormattedInstanceConfiguration;
};

type OidcConfigFormValues = Record<TInstanceOidcAuthenticationConfigurationKeys, string>;

export function InstanceOidcConfigForm(props: Props) {
  const { config } = props;
  // states
  const [isDiscardChangesModalOpen, setIsDiscardChangesModalOpen] = useState(false);
  // store hooks
  const { updateInstanceConfigurations } = useInstance();
  // form data
  const {
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<OidcConfigFormValues>({
    defaultValues: {
      OIDC_DISCOVERY_URL: config["OIDC_DISCOVERY_URL"] || "",
      OIDC_CLIENT_ID: config["OIDC_CLIENT_ID"],
      OIDC_CLIENT_SECRET: config["OIDC_CLIENT_SECRET"],
      ENABLE_OIDC_SYNC: config["ENABLE_OIDC_SYNC"] || "0",
    },
  });

  const originURL = !isEmpty(API_BASE_URL) ? API_BASE_URL : typeof window !== "undefined" ? window.location.origin : "";

  const OIDC_FORM_FIELDS: TControllerInputFormField[] = [
    {
      key: "OIDC_DISCOVERY_URL",
      type: "text",
      label: "Discovery URL",
      description: (
        <>
          The URL of your OIDC provider&apos;s discovery document (e.g.,{" "}
          <CodeBlock darkerShade>https://accounts.example.com/.well-known/openid-configuration</CodeBlock>).
        </>
      ),
      placeholder: "https://accounts.example.com/.well-known/openid-configuration",
      error: Boolean(errors.OIDC_DISCOVERY_URL),
      required: true,
    },
    {
      key: "OIDC_CLIENT_ID",
      type: "text",
      label: "Client ID",
      description: <>The client ID provided by your OIDC provider when you registered this application.</>,
      placeholder: "70a44354520df8bd9bcd",
      error: Boolean(errors.OIDC_CLIENT_ID),
      required: true,
    },
    {
      key: "OIDC_CLIENT_SECRET",
      type: "password",
      label: "Client secret",
      description: <>The client secret provided by your OIDC provider.</>,
      placeholder: "9b0050f94ec1b744e32ce79ea4ffacd40d4119cb",
      error: Boolean(errors.OIDC_CLIENT_SECRET),
      required: true,
    },
  ];

  const OIDC_FORM_SWITCH_FIELD: TControllerSwitchFormField<OidcConfigFormValues> = {
    name: "ENABLE_OIDC_SYNC",
    label: "OIDC",
  };

  const OIDC_SERVICE_FIELD: TCopyField[] = [
    {
      key: "Callback_URI",
      label: "Callback URI",
      url: `${originURL}/auth/oidc/callback/`,
      description: (
        <>
          We will auto-generate this. Paste this into your OIDC provider&apos;s
          <CodeBlock darkerShade>Redirect URI</CodeBlock> field.
        </>
      ),
    },
  ];

  const onSubmit = async (formData: OidcConfigFormValues) => {
    const payload: Partial<OidcConfigFormValues> = { ...formData };

    try {
      const response = await updateInstanceConfigurations(payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Done!",
        message: "Your OIDC authentication is configured. You should test it now.",
      });
      reset({
        OIDC_DISCOVERY_URL: response.find((item) => item.key === "OIDC_DISCOVERY_URL")?.value,
        OIDC_CLIENT_ID: response.find((item) => item.key === "OIDC_CLIENT_ID")?.value,
        OIDC_CLIENT_SECRET: response.find((item) => item.key === "OIDC_CLIENT_SECRET")?.value,
        ENABLE_OIDC_SYNC: response.find((item) => item.key === "ENABLE_OIDC_SYNC")?.value,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleGoBack = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (isDirty) {
      e.preventDefault();
      setIsDiscardChangesModalOpen(true);
    }
  };

  return (
    <>
      <ConfirmDiscardModal
        isOpen={isDiscardChangesModalOpen}
        onDiscardHref="/authentication"
        handleClose={() => setIsDiscardChangesModalOpen(false)}
      />
      <div className="flex flex-col gap-8">
        <div className="grid w-full grid-cols-2 gap-x-12 gap-y-8">
          <div className="col-span-2 flex flex-col gap-y-4 pt-1 md:col-span-1">
            <div className="pt-2.5 text-18 font-medium">OIDC-provided details for Plane</div>
            {OIDC_FORM_FIELDS.map((field) => (
              <ControllerInput
                key={field.key}
                control={control}
                type={field.type}
                name={field.key}
                label={field.label}
                description={field.description}
                placeholder={field.placeholder}
                error={field.error}
                required={field.required}
              />
            ))}
            <ControllerSwitch control={control} field={OIDC_FORM_SWITCH_FIELD} />
            <div className="flex flex-col gap-1 pt-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={(e) => void handleSubmit(onSubmit)(e)}
                  loading={isSubmitting}
                  disabled={!isDirty}
                >
                  {isSubmitting ? "Saving" : "Save changes"}
                </Button>
                <Link href="/authentication" className={getButtonStyling("secondary", "lg")} onClick={handleGoBack}>
                  Go back
                </Link>
              </div>
            </div>
          </div>
          <div className="col-span-2 md:col-span-1">
            <div className="flex flex-col gap-y-4 rounded-lg bg-layer-1 px-6 pt-1.5 pb-4">
              <div className="pt-2 text-18 font-medium">Plane-provided details for OIDC</div>
              {OIDC_SERVICE_FIELD.map((field) => (
                <CopyField key={field.key} label={field.label} url={field.url} description={field.description} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
