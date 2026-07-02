Write tests for the code described or shown above.

---

## Determine what to test

| Code type | Test location | Framework |
|-----------|--------------|-----------|
| React component | `frontend/src/components/__tests__/[Name].test.tsx` | Jest + React Testing Library |
| Custom hook | `frontend/src/hooks/__tests__/use[Name].test.ts` | Jest + `renderHook` |
| Utility function | `frontend/src/utils/__tests__/[name].test.ts` | Jest |
| Flask route | `backend/tests/test_[name].py` | pytest (run `pip install pytest` first) |
| Market scraper / fetcher | `backend/tests/test_markets.py` | pytest + mocked yfinance |

Note: `backend/tests/` exists but is empty — create test files as needed. No pytest suite is configured yet.

---

## Frontend component tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const renderComponent = (props = {}) =>
  render(
    <MemoryRouter>
      <MyComponent {...props} />
    </MemoryRouter>
  );

describe('MyComponent', () => {
  it('renders without crashing', () => {
    renderComponent();
    expect(screen.getByText(/expected text/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderComponent({ loading: true });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('calls handler when button clicked', () => {
    const onAction = jest.fn();
    renderComponent({ onAction });
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
```

## Frontend hook tests

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useStockData } from '../useStockData';

global.fetch = jest.fn();

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
});

it('returns data on success', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ benchmark: { roi_1y: 10 }, stocks: [], captured_at: null, is_complete: true }),
  });
  const { result } = renderHook(() => useStockData('tw'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data?.benchmark?.roi_1y).toBe(10);
});
```

## Backend Flask route tests (pytest)

```python
import pytest
from app import app, engine
from sqlalchemy import text

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_status_no_data(client):
    resp = client.get('/api/tw/status')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'has_data' in data

def test_unknown_market(client):
    resp = client.get('/api/xx/status')
    assert resp.status_code == 404

def test_data_returns_list(client):
    resp = client.get('/api/tw/data')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'stocks' in data
    assert isinstance(data['stocks'], list)
```

## What to cover (minimum)

For every piece of code, cover:
1. **Happy path** — normal successful operation
2. **Error path** — failure case (empty data, bad ticker, network error)
3. **Edge cases** — null fields, empty arrays, boundary conditions

## Running the tests

```bash
# Frontend
cd frontend && CI=true npm test -- --watchAll=false

# Backend (if pytest is set up)
cd backend && pytest tests/
```

All tests must pass before the work is done.
