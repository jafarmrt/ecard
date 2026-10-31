/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { PublicCardPage } from './pages/PublicCardPage';
import { Landing } from './pages/Landing';
import { OfflineIndicator } from './components/OfflineIndicator';
import { resolveRoute } from './utils/url';

// The admin panel is a separate chunk: visitors opening a card never download it.
const AdminApp = lazy(() => import('./admin/AdminApp'));

export default function App() {
  const route = resolveRoute();

  if (route.kind === 'admin') {
    return (
      <Suspense
        fallback={
          <div className="min-h-dvh bg-stone-100 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-[#D0192A] animate-spin" aria-label="در حال بارگذاری پنل" />
          </div>
        }
      >
        <AdminApp />
        <OfflineIndicator />
      </Suspense>
    );
  }

  if (route.kind === 'card') {
    return (
      <>
        <PublicCardPage identifier={route.identifier} />
        <OfflineIndicator />
      </>
    );
  }

  return <Landing />;
}
