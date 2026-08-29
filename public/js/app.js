/* Cornerblock Inventory System, small interface helpers.
   Plain JavaScript, no libraries, so the system keeps working
   offline on the office LAN.

   Contents:
     1. Mobile sidebar toggle
     2. Quantity steppers in the stock in / stock out modals
     3. Auto-submitting filter dropdowns
     4. Button loading state on submit
*/

(function () {
    'use strict';

    /* ========================================================
       1. MOBILE SIDEBAR
       On phones and tablets the sidebar slides in over the page.
       ======================================================== */

    var sidebar = document.getElementById('cbSidebar');
    var menuBtn = document.getElementById('cbMenuBtn');
    var backdrop = document.getElementById('cbBackdrop');

    function openSidebar() {
        sidebar.classList.add('is-open');
        backdrop.classList.add('show');
    }

    function closeSidebar() {
        sidebar.classList.remove('is-open');
        backdrop.classList.remove('show');
    }

    if (sidebar && menuBtn && backdrop) {
        menuBtn.addEventListener('click', openSidebar);
        backdrop.addEventListener('click', closeSidebar);

        // Escape closes the menu, the same as tapping the dark overlay
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeSidebar();
            }
        });
    }

    /* ========================================================
       2. QUANTITY STEPPERS
       Each stepper is a minus button, a number input, and a plus
       button. The input keeps its own min and max, so the buttons
       simply nudge the value and never push it out of range.
       ======================================================== */

    document.querySelectorAll('.cb-stepper').forEach(function (stepper) {
        var input = stepper.querySelector('input');
        var minus = stepper.querySelector('[data-step="down"]');
        var plus = stepper.querySelector('[data-step="up"]');

        // Changes the value by amount, staying inside min and max
        function nudge(amount) {
            var min = input.min !== '' ? parseInt(input.min, 10) : 1;
            var max = input.max !== '' ? parseInt(input.max, 10) : Infinity;
            var current = parseInt(input.value, 10);

            if (isNaN(current)) {
                current = min;
            }

            var next = current + amount;
            if (next < min) { next = min; }
            if (next > max) { next = max; }

            input.value = next;
        }

        if (minus) {
            minus.addEventListener('click', function () { nudge(-1); });
        }
        if (plus) {
            plus.addEventListener('click', function () { nudge(1); });
        }
    });

    /* ========================================================
       3. FILTER DROPDOWNS
       Choosing a category, status, or supplier submits the filter
       form straight away, so there is no extra "Apply" step.
       ======================================================== */

    document.querySelectorAll('[data-auto-submit]').forEach(function (control) {
        control.addEventListener('change', function () {
            control.form.submit();
        });
    });

    /* ========================================================
       4. SUBMIT BUTTON LOADING STATE
       Stops double submissions (a second stock-out click would
       otherwise log the movement twice) and shows the user that
       something is happening.
       ======================================================== */

    document.querySelectorAll('form[data-loading]').forEach(function (form) {
        form.addEventListener('submit', function () {
            var button = form.querySelector('button[type="submit"]');

            // Leave the button alone if the browser blocked the submit
            if (!button || !form.checkValidity()) {
                return;
            }

            button.disabled = true;
            button.textContent = button.dataset.loadingText || 'Saving...';
        });
    });
})();
