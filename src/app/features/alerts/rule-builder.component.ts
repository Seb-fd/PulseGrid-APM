import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
  type ValidatorFn,
} from '@angular/forms';
import { CoreStore } from '../../core/store/core-store.service';
import { AlertEngineService } from '../../core/store/alert-engine.service';
import type { AlertOperator, AlertRule, AlertSeverity } from '../../core/models/alert-rule.model';
import type { MetricKind } from '../../core/models/telemetry-metric.model';

const METRICS: readonly MetricKind[] = ['cpu', 'memory', 'latency', 'throughput'];
const OPERATORS: readonly AlertOperator[] = ['>', '<', '>=', '<=', '=='];
const SEVERITIES: readonly AlertSeverity[] = ['info', 'warning', 'critical'];

function newRuleId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `rule-${String(Date.now())}-${String(Math.floor(Math.random() * 1_000_000))}`;
  }
}

/** Bound alias: `Validators.required` is a static method reference that trips `@typescript-eslint/unbound-method`. */
const required: ValidatorFn = (control) => Validators.required(control);

/** Cross-field guard: cpu/memory thresholds must be percentages. */
function thresholdRangeValidator(group: AbstractControl): ValidationErrors | null {
  const metric = group.get('metric')?.value as MetricKind | null;
  const threshold = group.get('threshold')?.value as number | null;
  if ((metric === 'cpu' || metric === 'memory') && typeof threshold === 'number') {
    if (threshold < 0 || threshold > 100) return { thresholdRange: true };
  }
  return null;
}

/**
 * Rule Builder — Reactive Forms CRUD for alert rules.
 * FR-A1/A2: full validation, localStorage persistence via engine sync.
 */
@Component({
  selector: 'app-rule-builder',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      aria-label="Alert rule builder"
      class="rounded-lg border border-slate-800 bg-[#0d1117] p-4 shadow-sm"
    >
      <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase">Rule builder</h3>
      <p class="mt-0.5 font-mono text-[11px] leading-4 text-slate-400">
        Fire when a metric breaches threshold for duration
      </p>
      <form
        [formGroup]="form"
        (ngSubmit)="save()"
        class="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-2"
      >
        <label class="text-xs font-medium text-slate-400">
          Name
          <input
            type="text"
            formControlName="name"
            data-testid="rule-name"
            [attr.aria-invalid]="form.controls['name'].invalid"
            aria-describedby="error-name-text"
            class="mt-1.5 h-8 w-full rounded-md border border-slate-800 bg-[#030712] px-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </label>
        <label class="text-xs font-medium text-slate-400">
          Metric
          <select
            formControlName="metric"
            data-testid="rule-metric"
            class="mt-1.5 h-8 w-full rounded-md border border-slate-800 bg-[#030712] px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          >
            @for (m of metrics; track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select>
        </label>
        <label class="text-xs font-medium text-slate-400">
          Operator
          <select
            formControlName="operator"
            data-testid="rule-operator"
            class="mt-1.5 h-8 w-full rounded-md border border-slate-800 bg-[#030712] px-2.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          >
            @for (op of operators; track op) {
              <option [value]="op">{{ op }}</option>
            }
          </select>
        </label>
        <label class="text-xs font-medium text-slate-400">
          Threshold
          <input
            type="number"
            formControlName="threshold"
            data-testid="rule-threshold"
            [attr.aria-invalid]="form.controls['threshold'].invalid"
            aria-describedby="error-threshold-text"
            class="mt-1.5 h-8 w-full rounded-md border border-slate-800 bg-[#030712] px-2.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </label>
        <label class="text-xs font-medium text-slate-400">
          Duration (s, 5–300)
          <input
            type="number"
            formControlName="durationSec"
            data-testid="rule-duration"
            [attr.aria-invalid]="form.controls['durationSec'].invalid"
            aria-describedby="error-duration-text"
            class="mt-1.5 h-8 w-full rounded-md border border-slate-800 bg-[#030712] px-2.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </label>
        <label class="text-xs font-medium text-slate-400">
          Severity
          <select
            formControlName="severity"
            data-testid="rule-severity"
            class="mt-1.5 h-8 w-full rounded-md border border-slate-800 bg-[#030712] px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          >
            @for (s of severities; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </label>
        <label
          class="flex h-8 cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-400"
        >
          <input
            type="checkbox"
            formControlName="enabled"
            data-testid="rule-enabled"
            class="peer sr-only"
          />
          <span
            aria-hidden="true"
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-slate-600 bg-slate-800 transition-colors after:absolute after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-slate-400 after:transition-transform peer-checked:border-cyan-500/50 peer-checked:bg-cyan-500/20 peer-checked:after:translate-x-4 peer-checked:after:bg-cyan-300 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-500/40"
          ></span>
          Enabled
        </label>
        <div class="flex h-8 items-center">
          <button
            type="submit"
            [disabled]="form.invalid"
            data-testid="rule-save"
            class="h-8 rounded-md bg-cyan-500 px-4 text-xs font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40"
          >
            Save rule
          </button>
        </div>
      </form>
      @if (form.invalid && form.touched) {
        <div
          class="mt-3 space-y-1 rounded-md border border-rose-500/30 bg-rose-500/10 p-2"
          aria-live="polite"
        >
          @if (form.controls['name'].invalid) {
            <p
              id="error-name-text"
              data-testid="error-name"
              class="font-mono text-[11px] font-medium text-rose-300"
            >
              Name must be at least 3 characters.
            </p>
          }
          @if (form.controls['threshold'].invalid || form.hasError('thresholdRange')) {
            <p
              id="error-threshold-text"
              data-testid="error-threshold"
              class="font-mono text-[11px] font-medium text-rose-300"
            >
              Threshold must be finite (0–100 for CPU/Memory).
            </p>
          }
          @if (form.controls['durationSec'].invalid) {
            <p
              id="error-duration-text"
              data-testid="error-duration"
              class="font-mono text-[11px] font-medium text-rose-300"
            >
              Duration must be an integer between 5 and 300 seconds.
            </p>
          }
        </div>
      }
      <h4
        class="mt-4 border-t border-slate-800 pt-3 text-xs font-semibold tracking-wider text-slate-400 uppercase"
      >
        Rules ({{ rules().length }})
      </h4>
      <ul data-testid="rule-list" class="mt-2 space-y-1.5">
        @for (rule of rules(); track rule.id) {
          <li
            [attr.data-testid]="'rule-' + rule.id"
            class="flex items-center gap-2 rounded-md border border-slate-800 bg-[#030712] px-2.5 py-1.5 text-xs leading-5 text-slate-200 transition-colors hover:border-slate-700"
          >
            <span
              aria-hidden="true"
              class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              [class.bg-emerald-400]="rule.enabled"
              [class.bg-slate-600]="!rule.enabled"
              [style.boxShadow]="rule.enabled ? '0 0 6px rgba(52,211,153,0.7)' : 'none'"
            ></span>
            <span class="font-medium">{{ rule.name }}</span>
            <span class="font-mono text-[11px] text-slate-400"
              >{{ rule.metric }} {{ rule.operator }} {{ rule.threshold }}</span
            >
            <span class="hidden font-mono text-[11px] text-slate-400 sm:inline"
              >{{ rule.durationSec }}s · {{ rule.severity }}</span
            >
            <button
              type="button"
              (click)="toggleEnabled(rule)"
              [attr.data-testid]="'toggle-' + rule.id"
              [attr.aria-pressed]="rule.enabled"
              class="ml-auto h-7 rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 transition-colors hover:bg-slate-700"
            >
              {{ rule.enabled ? 'Disable' : 'Enable' }}
            </button>
            <button
              type="button"
              (click)="remove(rule.id)"
              [attr.data-testid]="'remove-' + rule.id"
              class="h-7 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 text-xs text-rose-400 transition-colors hover:bg-rose-500/20"
            >
              Remove
            </button>
          </li>
        } @empty {
          <li class="font-mono text-[11px] leading-4 text-slate-400">
            No rules yet — create one above.
          </li>
        }
      </ul>
    </section>
  `,
})
export class RuleBuilderComponent {
  private readonly store = inject(CoreStore);
  private readonly engine = inject(AlertEngineService);

  readonly metrics = METRICS;
  readonly operators = OPERATORS;
  readonly severities = SEVERITIES;
  readonly rules = this.store.rules;

  readonly form = new FormGroup(
    {
      name: new FormControl<string>('', {
        nonNullable: true,
        validators: [required, Validators.minLength(3)],
      }),
      metric: new FormControl<MetricKind>('latency', { nonNullable: true, validators: [required] }),
      operator: new FormControl<AlertOperator>('>', { nonNullable: true, validators: [required] }),
      threshold: new FormControl<number | null>(null, { validators: [required] }),
      durationSec: new FormControl<number | null>(null, {
        validators: [required, Validators.min(5), Validators.max(300), Validators.pattern(/^\d+$/)],
      }),
      severity: new FormControl<AlertSeverity>('warning', {
        nonNullable: true,
        validators: [required],
      }),
      enabled: new FormControl<boolean>(true, { nonNullable: true }),
    },
    { validators: [thresholdRangeValidator] },
  );

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    if (v.threshold === null || v.durationSec === null) return;
    const rule: AlertRule = {
      id: newRuleId(),
      name: v.name.trim(),
      metric: v.metric,
      operator: v.operator,
      threshold: v.threshold,
      durationSec: Math.floor(v.durationSec),
      enabled: v.enabled,
      severity: v.severity,
      createdAt: Date.now(),
    };
    this.store.upsertRule(rule);
    this.engine.syncRules();
    this.form.reset({
      name: '',
      metric: 'latency',
      operator: '>',
      threshold: null,
      durationSec: null,
      severity: 'warning',
      enabled: true,
    });
  }

  toggleEnabled(rule: AlertRule): void {
    this.store.upsertRule({ ...rule, enabled: !rule.enabled });
    this.engine.syncRules();
  }

  remove(id: string): void {
    this.store.removeRule(id);
    this.engine.syncRules();
  }
}
