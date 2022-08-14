if (typeof jQuery === 'undefined') {
  throw new Error('Baby Buddy requires jQuery.')
}

/**
 * Baby Buddy Namespace
 *
 * Default namespace for the Baby Buddy app.
 *
 * @type {{}}
 */
var BabyBuddy = function () {
    return {};
}();

/**
 * Pull to refresh.
 *
 * @type {{init: BabyBuddy.PullToRefresh.init, onRefresh: BabyBuddy.PullToRefresh.onRefresh}}
 */
BabyBuddy.PullToRefresh = function(ptr) {
    return {
        init: function () {
            ptr.init({
                mainElement: 'body',
                onRefresh: this.onRefresh
            });
        },

        onRefresh: function() {
            window.location.reload();
        }
    };
}(PullToRefresh);

/**
 * Fix for duplicate form submission from double pressing submit
 */
function preventDoubleSubmit() {
    return false;
}
$('form').off("submit", preventDoubleSubmit);
$("form").on("submit", function() {
    $(this).on("submit", preventDoubleSubmit);
});

/* Baby Buddy Timer
 *
 * Uses a supplied ID to run a timer. The element using the ID must have
 * three children with the following classes:
 *  * timer-seconds
 *  * timer-minutes
 *  * timer-hours
 */
BabyBuddy.Timer = function ($) {
    var runIntervalId = null;
    var timerId = null;
    var timerElement = null;
    var lastUpdate = new Date();
    var hidden = null;

    var Timer = {
        run: function(timer_id, element_id) {
            timerId = timer_id;
            timerElement = $('#' + element_id);

            if (timerElement.length === 0) {
                console.error('BBTimer: Timer element not found.');
                return false;
            }

            if (timerElement.find('.timer-seconds').length === 0
                || timerElement.find('.timer-minutes').length === 0
                || timerElement.find('.timer-hours').length === 0) {
                console.error('BBTimer: Element does not contain expected children.');
                return false;
            }

            runIntervalId = setInterval(this.tick, 1000);

            // If the page just came in to view, update the timer data with the
            // current actual duration. This will (potentially) help mobile
            // phones that lock with the timer page open.
            if (typeof document.hidden !== "undefined") {
                hidden = "hidden";
            }
            else if (typeof document.msHidden !== "undefined") {
                hidden = "msHidden";
            }
            else if (typeof document.webkitHidden !== "undefined") {
                hidden = "webkitHidden";
            }
            window.addEventListener('focus', Timer.handleVisibilityChange, false);
        },

        handleVisibilityChange: function() {
            if (!document[hidden] && (new Date()) - lastUpdate > 1) {
                Timer.update();
            }
        },

        tick: function() {
            var s = timerElement.find('.timer-seconds');
            var seconds = Number(s.text());
            if (seconds < 59) {
                s.text(seconds + 1);
                return;
            }
            else {
                s.text(0);
            }

            var m = timerElement.find('.timer-minutes');
            var minutes = Number(m.text());
            if (minutes < 59) {
                m.text(minutes + 1);
                return;
            }
            else {
                m.text(0);
            }

            var h = timerElement.find('.timer-hours');
            var hours = Number(h.text());
            h.text(hours + 1);
        },

        update: function() {
            $.get('/api/timers/' + timerId + '/', function(data) {
                if (data && 'duration' in data) {
                    clearInterval(runIntervalId);
                    var duration = data.duration.split(/[\s:.]/)
                    if (duration.length === 5) {
                        duration[0] = parseInt(duration[0]) * 24 + parseInt(duration[1]);
                        duration[1] = duration[2];
                        duration[2] = duration[3];
                    }
                    timerElement.find('.timer-hours').text(parseInt(duration[0]));
                    timerElement.find('.timer-minutes').text(parseInt(duration[1]));
                    timerElement.find('.timer-seconds').text(parseInt(duration[2]));
                    lastUpdate = new Date()

                    if (data['active']) {
                        runIntervalId = setInterval(Timer.tick, 1000);
                    }
                    else {
                        timerElement.addClass('timer-stopped');
                    }
                }
            });
        }
    };

    return Timer;
}(jQuery);

/* Baby Buddy Dashboard
 *
 * Provides a "watch" function to update the dashboard at one minute intervals
 * and/or on visibility state changes.
 */
BabyBuddy.Dashboard = function ($) {
    var runIntervalId = null;
    var dashboardElement = null;
    var hidden = null;

    var Dashboard = {
        watch: function(element_id, refresh_rate) {
            dashboardElement = $('#' + element_id);

            if (dashboardElement.length == 0) {
                console.error('Baby Buddy: Dashboard element not found.');
                return false;
            }

            if (typeof document.hidden !== "undefined") {
                hidden = "hidden";
            }
            else if (typeof document.msHidden !== "undefined") {
                hidden = "msHidden";
            }
            else if (typeof document.webkitHidden !== "undefined") {
                hidden = "webkitHidden";
            }

            if (typeof window.addEventListener === "undefined" || typeof document.hidden === "undefined") {
                if (refresh_rate) {
                    runIntervalId = setInterval(this.update, refresh_rate);
                }
            }
            else {
                window.addEventListener('focus', Dashboard.handleVisibilityChange, false);
                if (refresh_rate) {
                    runIntervalId = setInterval(Dashboard.handleVisibilityChange, refresh_rate);
                }
            }
        },

        handleVisibilityChange: function() {
            if (!document[hidden]) {
                Dashboard.update();
            }
        },

        update: function() {
            // TODO: Someday maybe update in place?
            location.reload();
        }
    };

    return Dashboard;
}(jQuery);
