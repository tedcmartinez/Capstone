// Application entry point
//
// At this stage of the migration this file only proves the scaffold works:
// it starts Firebase and reports whether the browser reached the project.
// Authentication, routing, and the page modules are added in the steps that
// follow, and this placeholder is replaced when they are.

import { auth, db } from './lib/firebase.js';
import { APP_NAME, APP_VERSION, SYSTEM_TITLE } from './lib/config.js';

const root = document.getElementById('app');

root.innerHTML = `
  <div class="cb-gate">
    <div class="cb-gate-card">
      <h1 class="cb-gate-title">${APP_NAME}</h1>
      <p class="cb-gate-text">
        ${SYSTEM_TITLE}
      </p>
      <span class="cb-gate-email">
        Scaffold ready, version ${APP_VERSION}.<br>
        Firebase project: ${db.app.options.projectId}<br>
        Auth service: ${auth.app.options.authDomain}
      </span>
      <p class="cb-gate-text" style="margin-bottom:0;">
        Sign-in and the inventory pages are built in the next steps.
      </p>
    </div>
  </div>
`;
