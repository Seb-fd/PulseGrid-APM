import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadChildren: () => import('./features/dashboard/routes').then((m) => m.DASHBOARD_ROUTES),
  },
  {
    path: 'telemetry',
    loadChildren: () => import('./features/telemetry/routes').then((m) => m.TELEMETRY_ROUTES),
  },
  {
    path: 'logs',
    loadChildren: () => import('./features/logs/routes').then((m) => m.LOGS_ROUTES),
  },
  {
    path: 'topology',
    loadChildren: () => import('./features/topology/routes').then((m) => m.TOPOLOGY_ROUTES),
  },
  {
    path: 'alerts',
    loadChildren: () => import('./features/alerts/routes').then((m) => m.ALERTS_ROUTES),
  },
  { path: '**', redirectTo: 'dashboard' },
];
