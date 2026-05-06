/**
 * k6 Load Test — Exam Portal
 * Usage: k6 run k6-exam-load-test.js
 * Install k6: https://k6.io/docs/getting-started/installation/
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const autosaveErrors   = new Counter('autosave_errors');
const telemetryErrors  = new Counter('telemetry_errors');
const autosaveDuration = new Trend('autosave_duration');

export const options = {
  stages: [
    { duration: '30s', target: 50  },
    { duration: '2m',  target: 100 },
    { duration: '1m',  target: 200 },
    { duration: '30s', target: 0   },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.01'],
    autosave_errors:   ['count<5'],
  },
};

const BASE  = __ENV.BASE_URL || 'https://your-exam-portal.vercel.app';
const TOKEN = __ENV.TOKEN    || 'test-token';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

export default function () {
  const vu        = __VU;
  const sessionId = `load-test-session-${vu}`;
  const qId       = `load-test-q-${(vu % 10) + 1}`;

  group('autosave', () => {
    const start = Date.now();
    const res = http.post(`${BASE}/api/autosave`, JSON.stringify({
      session_id: sessionId,
      responses: [
        {
          question_id: qId,
          answer_json: { selected_option: ['A','B','C','D'][vu % 4] },
          updated_at: new Date().toISOString(),
          is_final: false,
        },
      ],
      client_ts: Date.now(),
    }), { headers: HEADERS });

    autosaveDuration.add(Date.now() - start);

    const ok = check(res, {
      'autosave status 200 or 429': (r) => r.status === 200 || r.status === 429,
    });
    if (!ok) autosaveErrors.add(1);
  });

  // Simulate telemetry batch
  group('telemetry', () => {
    const events = [
      { event_id: `${sessionId}-evt-${Date.now()}`, type: 'tab_focus', payload_json: {}, ts: Date.now() },
    ];
    const res = http.post(`${BASE}/api/events_batch`, JSON.stringify({
      session_id: sessionId,
      events,
    }), { headers: HEADERS });

    const ok = check(res, {
      'events 200 or 429': (r) => r.status === 200 || r.status === 429,
    });
    if (!ok) telemetryErrors.add(1);
  });

  // Each VU waits 30s (simulates 30s batch interval)
  sleep(30);
}
