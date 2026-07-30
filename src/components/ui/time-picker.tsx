"use client"

import * as React from "react"
import { Clock } from "lucide-react"

import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))

function ScrollColumn({
  items,
  value,
  onSelect,
  disabled,
}: {
  items: string[]
  value: string
  onSelect: (v: string) => void
  disabled?: boolean
}) {
  const listRef = React.useRef<HTMLDivElement>(null)

  // Scroll selected item into center when opened
  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>("[data-selected=true]")
    el?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior })
  }, [])

  return (
    <div
      ref={listRef}
      className="flex h-48 flex-1 flex-col overflow-y-auto scroll-smooth py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const isSelected = item === value
        return (
          <button
            key={item}
            type="button"
            data-selected={isSelected}
            disabled={disabled}
            onClick={() => onSelect(item)}
            className={cn(
              "flex h-8 w-full shrink-0 items-center justify-center rounded-md text-sm font-mono transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {item}
          </button>
        )
      })}
    </div>
  )
}

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  /** Nom accessible du déclencheur. `TimePickerField` y passe son libellé. */
  ariaLabel?: string
}

/**
 * Le nom accessible vient de `ariaLabel`, pas du `<label>` voisin.
 *
 * Le déclencheur est un bouton, et un `<label htmlFor>` ne peut pas étiqueter un
 * bouton. Son nom se réduisait donc à son contenu — « 09:00 », ou « Choisir… » —
 * si bien que les deux champs adjacents « Ouverture » et « Fermeture » étaient
 * indistinguables : deux boutons annonçant la même chose.
 */
function TimePicker({ value, onChange, disabled, className, ariaLabel }: TimePickerProps) {
  const [open, setOpen] = React.useState(false)

  const hours = value.split(":")[0] ?? ""
  const minutes = value.split(":")[1] ?? ""

  const handleHours = (h: string) => onChange(`${h}:${minutes || "00"}`)
  const handleMinutes = (m: string) => onChange(`${hours || "00"}:${m}`)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "h-9 w-full justify-start border-border bg-muted/50 font-normal",
            !value && "text-muted-foreground",
            className
          )}
          data-empty={!value}
        >
          <Clock className="mr-2 size-4 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="font-mono tabular-nums">{value}</span>
          ) : (
            <span>Choisir…</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-2"
        align="start"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 px-1">
            <span className="flex-1 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">HH</span>
            <span className="w-4" />
            <span className="flex-1 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">MM</span>
          </div>
          <div className="flex items-center gap-1">
            <ScrollColumn items={HOURS} value={hours} onSelect={handleHours} disabled={disabled} />
            <span className="text-base font-bold text-muted-foreground">:</span>
            <ScrollColumn items={MINUTES} value={minutes} onSelect={handleMinutes} disabled={disabled} />
          </div>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => { onChange(""); setOpen(false) }}
            >
              Effacer
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface TimePickerFieldProps extends TimePickerProps {
  label: string
}

function TimePickerField({ label, value, onChange, disabled, className }: TimePickerFieldProps) {
  const fieldLabel = "mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"

  return (
    <div className={cn("min-w-[140px] flex-1", className)}>
      {/* `<span>` et non `<label>` : un label ne peut pas étiqueter un bouton, et
          celui-ci n'étiquetait donc rien. Le nom passe par `ariaLabel`. */}
      <span className={fieldLabel}>{label}</span>
      <TimePicker
        value={value}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={label}
      />
    </div>
  )
}

export { TimePicker, TimePickerField }
