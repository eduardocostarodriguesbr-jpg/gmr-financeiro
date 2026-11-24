import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
export function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(String(props.defaultValue ?? ""));
  const current = props.value === undefined ? value : String(props.value);
  const label =
    props["aria-label"] ??
    {
      current_password: "Senha atual",
      confirm: "Confirmar senha",
      password:
        props.autoComplete === "current-password" ? "Senha" : "Nova senha",
    }[props.name ?? ""] ??
    "Senha";
  return (
    <span className="password-field">
      <span className="password-control">
        <input
          {...props}
          aria-label={label}
          type={visible ? "text" : "password"}
          value={current}
          maxLength={props.maxLength ?? 128}
          onChange={(e) => {
            setValue(e.target.value);
            props.onChange?.(e);
          }}
        />
        <span className="password-actions">
          <button
            type="button"
            className="password-action"
            aria-label={
              (visible ? "Ocultar" : "Mostrar") + " " + label.toLowerCase()
            }
            aria-pressed={visible}
            title={visible ? "Ocultar senha" : "Mostrar senha"}
            onClick={(e) => {
              e.preventDefault();
              setVisible((v) => !v);
            }}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
      </span>
    </span>
  );
}
