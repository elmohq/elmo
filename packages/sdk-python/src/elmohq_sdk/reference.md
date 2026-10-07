# Reference
## Brands
<details><summary><code>client.brands.<a href="src/elmohq_sdk/brands/client.py">list_brands</a>(...) -> BrandsList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.brands.list_brands()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**page:** `typing.Optional[int]` — Page number, 1-based.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Items per page. Values above the maximum are clamped, not rejected.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.brands.<a href="src/elmohq_sdk/brands/client.py">create_brand</a>(...) -> Brand</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.brands.create_brand(
    id="id",
    name="name",
    domains=[
        "domains"
    ],
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**domains:** `typing.List[str]` — Brand domains. The first entry is the primary website; remaining entries are additional domains.
    
</dd>
</dl>

<dl>
<dd>

**aliases:** `typing.Optional[typing.List[str]]` 
    
</dd>
</dl>

<dl>
<dd>

**competitors:** `typing.Optional[typing.List[CreateBrandRequestCompetitorsItem]]` 
    
</dd>
</dl>

<dl>
<dd>

**prompts:** `typing.Optional[typing.List[CreateBrandRequestPromptsItem]]` 
    
</dd>
</dl>

<dl>
<dd>

**organization_id:** `typing.Optional[str]` 

Organization to create the brand in.

| | Omitted | Present |
| --- | --- | --- |
| **Organization key** | creates in the key's own organization | must name the key's own organization; any other value is a `400` |
| **Admin key** | provisions a new organization named after the brand id | creates in the named organization, which must already exist — `404` if it does not |

An admin key omitting this field is currently the only way to create an organization over the API.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.brands.<a href="src/elmohq_sdk/brands/client.py">get_brand</a>(...) -> Brand</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.brands.get_brand(
    brand_id="brandId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.brands.<a href="src/elmohq_sdk/brands/client.py">update_brand</a>(...) -> Brand</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.brands.update_brand(
    brand_id="brandId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier
    
</dd>
</dl>

<dl>
<dd>

**brand_name:** `typing.Optional[str]` 
    
</dd>
</dl>

<dl>
<dd>

**domains:** `typing.Optional[typing.List[str]]` — Brand domains. The first entry is the primary website; remaining entries are additional domains.
    
</dd>
</dl>

<dl>
<dd>

**aliases:** `typing.Optional[typing.List[str]]` 
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `typing.Optional[bool]` — Whether the brand is sampled at all. **Modifiable only with an instance admin key**: setting it with an organization key is a `403`, because disabling ends tracking silently while the plan keeps being billed and no dashboard control does it at any role.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Analytics
<details><summary><code>client.analytics.<a href="src/elmohq_sdk/analytics/client.py">get_brand_analytics</a>(...) -> BrandAnalytics</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Visibility, share of voice, the per-model breakdown and the citation totals for one window, in one request.

The long lists — cited domains and URLs, sub-queries, per-prompt results — are endpoints of their own. Everything else is always included.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment
import datetime

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.analytics.get_brand_analytics(
    brand_id="brandId",
    start=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
    end=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier.
    
</dd>
</dl>

<dl>
<dd>

**start:** `datetime.datetime` — Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
    
</dd>
</dl>

<dl>
<dd>

**end:** `datetime.datetime` — Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
    
</dd>
</dl>

<dl>
<dd>

**model:** `typing.Optional[str]` — Restrict to one model, e.g. `chatgpt`. See `GET /models`.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `typing.Optional[str]` — Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.analytics.<a href="src/elmohq_sdk/analytics/client.py">list_brand_citation_domains</a>(...) -> CitationDomainList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Domains the engines cited when answering this brand's prompts, categorized and compared against the equal-length window immediately before this one.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment
import datetime

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.analytics.list_brand_citation_domains(
    brand_id="brandId",
    start=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
    end=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier.
    
</dd>
</dl>

<dl>
<dd>

**start:** `datetime.datetime` — Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
    
</dd>
</dl>

<dl>
<dd>

**end:** `datetime.datetime` — Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
    
</dd>
</dl>

<dl>
<dd>

**model:** `typing.Optional[str]` — Restrict to one model, e.g. `chatgpt`. See `GET /models`.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `typing.Optional[str]` — Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.analytics.<a href="src/elmohq_sdk/analytics/client.py">list_brand_citation_urls</a>(...) -> CitationUrlList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Individual pages the engines cited, with their category and page type.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment
import datetime

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.analytics.list_brand_citation_urls(
    brand_id="brandId",
    start=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
    end=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier.
    
</dd>
</dl>

<dl>
<dd>

**start:** `datetime.datetime` — Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
    
</dd>
</dl>

<dl>
<dd>

**end:** `datetime.datetime` — Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
    
</dd>
</dl>

<dl>
<dd>

**model:** `typing.Optional[str]` — Restrict to one model, e.g. `chatgpt`. See `GET /models`.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `typing.Optional[str]` — Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.analytics.<a href="src/elmohq_sdk/analytics/client.py">list_brand_prompt_performance</a>(...) -> PromptPerformanceList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Per-prompt mention rates over the window. The analytics counterpart to `GET /prompts?brandId=`, which returns prompt configuration rather than results.

A prompt the brand stopped tracking is not sampled, so it has no results over the window and does not appear here.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment
import datetime

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.analytics.list_brand_prompt_performance(
    brand_id="brandId",
    start=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
    end=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier.
    
</dd>
</dl>

<dl>
<dd>

**start:** `datetime.datetime` — Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
    
</dd>
</dl>

<dl>
<dd>

**end:** `datetime.datetime` — Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
    
</dd>
</dl>

<dl>
<dd>

**model:** `typing.Optional[str]` — Restrict to one model, e.g. `chatgpt`. See `GET /models`.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `typing.Optional[str]` — Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.analytics.<a href="src/elmohq_sdk/analytics/client.py">get_brand_query_fanout</a>(...) -> BrandQueryFanout</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The searches engines ran while answering this brand's prompts. Engines that don't expose their searches still contribute runs, so `coverageRate` is the honest denominator.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment
import datetime

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.analytics.get_brand_query_fanout(
    brand_id="brandId",
    start=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
    end=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier.
    
</dd>
</dl>

<dl>
<dd>

**start:** `datetime.datetime` — Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
    
</dd>
</dl>

<dl>
<dd>

**end:** `datetime.datetime` — Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
    
</dd>
</dl>

<dl>
<dd>

**model:** `typing.Optional[str]` — Restrict to one model, e.g. `chatgpt`. See `GET /models`.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `typing.Optional[str]` — Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Opportunities
<details><summary><code>client.opportunities.<a href="src/elmohq_sdk/opportunities/client.py">get_brand_opportunities</a>(...) -> BrandOpportunities</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

**Experimental — the response shape may still change.**

The brand's Opportunities report: a prioritized set of ways to get cited more often, with the tracked prompts and cited pages behind each one. The same analysis the dashboard shows, from the same code.

Generation is inline and synchronous. A stored report is served while it is fresh and regenerated when it is not, so there is nothing to poll for and no way to be handed a stale one — but a request that triggers a generation waits for it. The freshness window bounds the cost: however many callers ask, one generation per brand per window. There is deliberately no `POST`, which would spend provider budget with nothing metering it per call.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.opportunities.get_brand_opportunities(
    brand_id="brandId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Tags
<details><summary><code>client.tags.<a href="src/elmohq_sdk/tags/client.py">list_brand_tags</a>(...) -> TagList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every tag in use on the brand's prompts, with how many carry each — enough to build the same filter the dashboard shows without paging the whole prompt list to derive it.

Tags are not a resource of their own: a tag exists exactly as long as some prompt carries it. `branded` and `unbranded` are computed by Elmo and always listed.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.tags.list_brand_tags(
    brand_id="brandId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Competitors
<details><summary><code>client.competitors.<a href="src/elmohq_sdk/competitors/client.py">list_competitors</a>(...) -> CompetitorsList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.competitors.list_competitors()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `typing.Optional[str]` 
    
</dd>
</dl>

<dl>
<dd>

**page:** `typing.Optional[int]` — Page number, 1-based.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Items per page. Values above the maximum are clamped, not rejected.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.competitors.<a href="src/elmohq_sdk/competitors/client.py">create_competitor</a>(...) -> Competitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.competitors.create_competitor(
    brand_id="brandId",
    name="name",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**name:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**domains:** `typing.Optional[typing.List[str]]` 
    
</dd>
</dl>

<dl>
<dd>

**aliases:** `typing.Optional[typing.List[str]]` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.competitors.<a href="src/elmohq_sdk/competitors/client.py">get_competitor</a>(...) -> Competitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.competitors.get_competitor(
    competitor_id="competitorId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**competitor_id:** `str` — Competitor identifier (UUID)
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.competitors.<a href="src/elmohq_sdk/competitors/client.py">delete_competitor</a>(...) -> Competitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.competitors.delete_competitor(
    competitor_id="competitorId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**competitor_id:** `str` — Competitor identifier (UUID)
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.competitors.<a href="src/elmohq_sdk/competitors/client.py">update_competitor</a>(...) -> Competitor</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>


</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.competitors.update_competitor(
    competitor_id="competitorId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**competitor_id:** `str` — Competitor identifier (UUID)
    
</dd>
</dl>

<dl>
<dd>

**name:** `typing.Optional[str]` 
    
</dd>
</dl>

<dl>
<dd>

**domains:** `typing.Optional[typing.List[str]]` 
    
</dd>
</dl>

<dl>
<dd>

**aliases:** `typing.Optional[typing.List[str]]` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Identity
<details><summary><code>client.identity.<a href="src/elmohq_sdk/identity/client.py">get_me</a>() -> ApiKeyIdentity</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

What this key is, which organization and brands it reaches, and which scopes it holds. Requires no scope, so it is always safe to call first when wiring up an integration.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.identity.get_me()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Models
<details><summary><code>client.models.<a href="src/elmohq_sdk/models/client.py">list_models</a>() -> ModelList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The answer engines this deployment can track, so a client can build a model filter without hardcoding ids that differ between deployments.

Requires no scope.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.models.list_models()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Organizations
<details><summary><code>client.organizations.<a href="src/elmohq_sdk/organizations/client.py">list_organizations</a>(...) -> OrganizationList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One entry for an organization key — the one it acts inside. Every organization for an instance admin key. No scope required: a key can only ever see the organization it is already bound to.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.organizations.list_organizations()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**page:** `typing.Optional[int]` — Page number, 1-based.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Items per page. Values above the maximum are clamped, not rejected.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.organizations.<a href="src/elmohq_sdk/organizations/client.py">get_organization</a>(...) -> Organization</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

No scope required. An organization outside the key's reach answers `404`, identically to one that does not exist.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.organizations.get_organization(
    organization_id="organizationId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**organization_id:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.organizations.<a href="src/elmohq_sdk/organizations/client.py">get_organization_billing</a>(...) -> OrganizationBilling</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organization's plan, its limits, and how much of each limit is already spent — enough for an integration to know a write will be rejected before attempting it.

This endpoint is read-only by construction. No API key of any kind can change a subscription, an add-on quantity, or a payment method; there is no billing write endpoint and no billing write scope. Stripe identifiers, invoices, and payment methods are never returned.

Deployments without billing answer `200` with `billingEnabled: false`, a null plan, and null limits, so callers need no special case.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.organizations.get_organization_billing(
    organization_id="organizationId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**organization_id:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Prompts
<details><summary><code>client.prompts.<a href="src/elmohq_sdk/prompts/client.py">list_prompts</a>(...) -> ListPromptsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Retrieve a paginated list of all prompts across all brands
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.prompts.list_prompts()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `typing.Optional[str]` — Filter prompts by brand ID
    
</dd>
</dl>

<dl>
<dd>

**page:** `typing.Optional[int]` — Page number, 1-based.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Items per page. Values above the maximum are clamped, not rejected. This list had no ceiling before, so the maximum is set to bound a runaway query rather than to change what an existing caller gets back.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `typing.Optional[bool]` — Only prompts with this tracking state.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `typing.Optional[str]` — Comma-separated tags. A prompt matches if it carries any of them.
    
</dd>
</dl>

<dl>
<dd>

**q:** `typing.Optional[str]` — Case-insensitive substring match on prompt text.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.prompts.<a href="src/elmohq_sdk/prompts/client.py">create_prompt</a>(...) -> Prompt</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Create a new prompt for a brand. This will automatically schedule the prompt for execution.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.prompts.create_prompt(
    brand_id="brandId",
    value="value",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_id:** `str` — Brand identifier this prompt belongs to
    
</dd>
</dl>

<dl>
<dd>

**value:** `str` — The prompt text
    
</dd>
</dl>

<dl>
<dd>

**tags:** `typing.Optional[typing.List[str]]` — User-defined tags for categorizing this prompt
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.prompts.<a href="src/elmohq_sdk/prompts/client.py">get_prompt</a>(...) -> Prompt</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Retrieve a specific prompt by ID
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.prompts.get_prompt(
    prompt_id="promptId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**prompt_id:** `str` — The ID of the prompt
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.prompts.<a href="src/elmohq_sdk/prompts/client.py">delete_prompt</a>(...) -> DeletePromptResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Permanently delete a prompt and cancel all related scheduled jobs. This will also cascade delete all associated prompt runs.

Requires an instance admin key; organization keys receive `403`. The dashboard has no delete either — stop tracking a prompt with `PATCH /prompts/{promptId}` and `enabled: false`, which keeps its history and frees the plan slot.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.prompts.delete_prompt(
    prompt_id="promptId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**prompt_id:** `str` — The ID of the prompt to delete
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.prompts.<a href="src/elmohq_sdk/prompts/client.py">update_prompt</a>(...) -> Prompt</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Update a prompt's properties. Only provided fields will be updated. Toggling `enabled` schedules or unschedules the recurring run job.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.prompts.update_prompt(
    prompt_id="promptId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**prompt_id:** `str` — The ID of the prompt to update
    
</dd>
</dl>

<dl>
<dd>

**value:** `typing.Optional[str]` — The prompt text
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `typing.Optional[bool]` — Whether the prompt is enabled
    
</dd>
</dl>

<dl>
<dd>

**tags:** `typing.Optional[typing.List[str]]` — User-defined tags for categorizing this prompt
    
</dd>
</dl>

<dl>
<dd>

**premium_models:** `typing.Optional[typing.List[str]]` — Replaces the prompt's grounded models. Checked against the organization's premium pool.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Runs
<details><summary><code>client.runs.<a href="src/elmohq_sdk/runs/client.py">list_prompt_runs</a>(...) -> RunList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Individual model answers behind the aggregates, newest first, without their text — the list stays small enough to page through. Fetch `GET /prompts/{promptId}/runs/{runId}` for the answer itself.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment
import datetime

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.runs.list_prompt_runs(
    prompt_id="promptId",
    start=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
    end=datetime.datetime.fromisoformat("2024-01-15T09:30:00+00:00"),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**prompt_id:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**start:** `datetime.datetime` — Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
    
</dd>
</dl>

<dl>
<dd>

**end:** `datetime.datetime` — Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
    
</dd>
</dl>

<dl>
<dd>

**model:** `typing.Optional[str]` — Restrict to one model, e.g. `chatgpt`. See `GET /models`.
    
</dd>
</dl>

<dl>
<dd>

**page:** `typing.Optional[int]` — Page number, 1-based.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Items per page. Values above the maximum are clamped, not rejected.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.runs.<a href="src/elmohq_sdk/runs/client.py">get_run</a>(...) -> Run</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One model answer, with its text normalized out of the provider’s response and its citations in the order the engine listed them. A run belonging to some other prompt answers `404`. The provider’s raw payload is deliberately not exposed — its shape belongs to the provider, not to this API.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.runs.get_run(
    prompt_id="promptId",
    run_id="runId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**prompt_id:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**run_id:** `str` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Snapshots
<details><summary><code>client.snapshots.<a href="src/elmohq_sdk/snapshots/client.py">get_prompt_snapshot</a>(...) -> PromptSnapshot</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Get an aggregated snapshot of mention and citation analytics for a specific prompt over a date range. Use this to identify competitive gaps, track brand visibility trends, and discover top cited URLs.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment
import datetime

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.snapshots.get_prompt_snapshot(
    prompt_id="promptId",
    start_date=datetime.date.fromisoformat("2026-01-08"),
    end_date=datetime.date.fromisoformat("2026-01-15"),
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**prompt_id:** `str` — The ID of the prompt
    
</dd>
</dl>

<dl>
<dd>

**start_date:** `datetime.date` — Start of date range (YYYY-MM-DD)
    
</dd>
</dl>

<dl>
<dd>

**end_date:** `datetime.date` — End of date range (YYYY-MM-DD)
    
</dd>
</dl>

<dl>
<dd>

**k_mentions:** `typing.Optional[int]` — Number of top competitor entities to return in mentionsTopK
    
</dd>
</dl>

<dl>
<dd>

**k_citations:** `typing.Optional[int]` — Number of top cited URLs to return in citedUrlsTopK
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Reports
<details><summary><code>client.reports.<a href="src/elmohq_sdk/reports/client.py">list_reports</a>(...) -> ListReportsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Retrieve a paginated list of all reports, ordered by creation date (newest first).

Requires an instance admin key; organization keys receive `403`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.reports.list_reports()

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**page:** `typing.Optional[int]` — Page number, 1-based.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `typing.Optional[int]` — Items per page. Values above the maximum are clamped, not rejected.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.reports.<a href="src/elmohq_sdk/reports/client.py">create_report</a>(...) -> CreateReportResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Create a new AI Share of Voice report and queue it for generation. The report will evaluate the brand across multiple AI engines (ChatGPT, Claude, Google AI) using generated and optional custom prompts.

Requires an instance admin key; organization keys receive `403`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.reports.create_report(
    brand_name="brandName",
    brand_website="brandWebsite",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**brand_name:** `str` — The brand name to analyze
    
</dd>
</dl>

<dl>
<dd>

**brand_website:** `str` — The brand's website — a domain (nike.com) or a full URL. A URL with a path (e.g. https://www.nike.com/golf) scopes the analysis to that page; mentions are tracked against its domain either way.
    
</dd>
</dl>

<dl>
<dd>

**brand_aliases:** `typing.Optional[typing.List[str]]` — Other names the brand goes by (spellings, abbreviations, product names). A mention of any of them counts as a brand mention.
    
</dd>
</dl>

<dl>
<dd>

**manual_prompts:** `typing.Optional[typing.List[str]]` — Optional list of custom prompts to include in the report
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.reports.<a href="src/elmohq_sdk/reports/client.py">get_report</a>(...) -> GetReportResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Poll a report's status. When completed, returns per-prompt snapshot data with raw mention counts. Consumers are responsible for computing SoV and other derived metrics from the raw data.

Requires an instance admin key; organization keys receive `403`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.reports.get_report(
    report_id="reportId",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**report_id:** `str` — The ID of the report
    
</dd>
</dl>

<dl>
<dd>

**k_mentions:** `typing.Optional[int]` — Number of top competitor entities to return in each prompt's mentionsTopK
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Tools
<details><summary><code>client.tools.<a href="src/elmohq_sdk/tools/client.py">analyze_brand</a>(...) -> OnboardingSuggestion</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Run brand analysis without persisting anything. Returns suggested additional domains, aliases, competitors, and prompts.

Requires an instance admin key; organization keys receive `403`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```python
from elmohq_sdk import Elmo
from elmohq_sdk.environment import ElmoEnvironment

client = Elmo(
    token="<token>",
    environment=ElmoEnvironment.DEFAULT,
)

client.tools.analyze_brand(
    website="website",
)

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**website:** `str` — Brand's website — a hostname or a full URL. A URL with a path (e.g. https://www.nike.com/golf) is analyzed as given; the returned website is always its domain.
    
</dd>
</dl>

<dl>
<dd>

**brand_name:** `typing.Optional[str]` — Optional brand name hint. If omitted, inferred from the domain.
    
</dd>
</dl>

<dl>
<dd>

**max_competitors:** `typing.Optional[int]` — Maximum number of competitor suggestions. 0 disables competitor generation entirely.
    
</dd>
</dl>

<dl>
<dd>

**max_prompts:** `typing.Optional[int]` — Maximum number of suggested prompts. 0 disables prompt generation entirely.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `typing.Optional[RequestOptions]` — Request-specific configuration.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

