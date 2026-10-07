from __future__ import annotations

from datetime import date as date_, datetime
from typing import Annotated, ClassVar
from uuid import UUID

from pydantic import AnyUrl, BaseModel, ConfigDict, Field

from .shared import OpenEnum


class DateRange(BaseModel):
    """The window the response was computed over, echoed back as the half-open instants it resolved to."""

    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    end: datetime
    """Exclusive upper bound, in UTC."""
    start: datetime
    """Inclusive lower bound, in UTC."""


class VisibilityPoint(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    date: date_
    visibility: float | None
    """Null on days with no runs to plot; the series is not gap-filled with zeros. Ratio 0–1; multiply by 100 for a percentage."""


class ShareOfVoiceEntry(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    is_brand: bool = Field(
        ..., validation_alias="isBrand", serialization_alias="isBrand"
    )
    """True for the tracked brand's own row."""
    mentions: int
    name: str
    """Brand or competitor name."""
    prompts: int
    """Distinct prompts this entity appeared in."""
    share: Annotated[float, Field(ge=0, le=1)]
    """This entity's share of all brand and competitor mentions. Ratio 0–1; multiply by 100 for a percentage."""


class ShareOfVoicePoint(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    date: date_
    share: float | None
    """The brand's share on this day. Null on days with no runs. Ratio 0–1; multiply by 100 for a percentage."""


class CitationDomainCategory(str, OpenEnum):
    """Which side of the citation landscape the domain sits on."""

    BRAND = "brand"
    COMPETITOR = "competitor"
    EDITORIAL = "editorial"
    REVIEWS = "reviews"
    ECOMMERCE = "ecommerce"
    SOCIAL = "social"
    DEVELOPER = "developer"
    PR = "pr"
    REFERENCE = "reference"
    INSTITUTIONAL = "institutional"
    OTHER = "other"


class CitationDomain(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    category: CitationDomainCategory
    """Which side of the citation landscape the domain sits on."""
    change_factor: float | None = Field(
        ..., validation_alias="changeFactor", serialization_alias="changeFactor"
    )
    """How this window compares with the equal-length window before it, as a multiplier of the previous count: 2 means twice as many citations, 0.5 means half, 1 means unchanged. Not a percentage change — 1.5 is "1.5x", which is a 50% increase. Null when the domain had no citations in the previous window, so there is nothing to divide by."""
    count: int
    """Citations to this domain in the window."""
    domain: str
    previous_count: int = Field(
        ..., validation_alias="previousCount", serialization_alias="previousCount"
    )
    """Citations in the equal-length window immediately before this one."""
    prompt_count: int = Field(
        ..., validation_alias="promptCount", serialization_alias="promptCount"
    )
    """Distinct prompts whose answers cited this domain."""
    share: Annotated[float, Field(ge=0, le=1)]
    """Share of all citations in the window. Ratio 0–1; multiply by 100 for a percentage."""


class CitationDomainListTotals(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(populate_by_name=True)
    citations: int
    unique_domains: int = Field(
        ..., validation_alias="uniqueDomains", serialization_alias="uniqueDomains"
    )
    unique_urls: int = Field(
        ..., validation_alias="uniqueUrls", serialization_alias="uniqueUrls"
    )


class CitationDomainList(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    data: list[CitationDomain]
    """Every domain cited over the window, ordered by citation count."""
    range: DateRange
    totals: CitationDomainListTotals


class CitationUrlCategory(str, OpenEnum):
    """Which side of the citation landscape the domain sits on."""

    BRAND = "brand"
    COMPETITOR = "competitor"
    EDITORIAL = "editorial"
    REVIEWS = "reviews"
    ECOMMERCE = "ecommerce"
    SOCIAL = "social"
    DEVELOPER = "developer"
    PR = "pr"
    REFERENCE = "reference"
    INSTITUTIONAL = "institutional"
    OTHER = "other"


class CitationUrlPageType(str, OpenEnum):
    """What kind of page was cited."""

    HOMEPAGE = "homepage"
    ARTICLE = "article"
    LISTICLE = "listicle"
    HOWTO = "howto"
    COMPARISON = "comparison"
    REVIEW = "review"
    FORUM = "forum"
    VIDEO = "video"
    DOC = "doc"
    PRODUCT = "product"
    INFO = "info"
    SEARCH = "search"
    SHOPPING = "shopping"
    OTHER = "other"


class CitationUrl(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    category: CitationUrlCategory
    """Which side of the citation landscape the domain sits on."""
    count: int
    domain: str
    is_new: bool = Field(..., validation_alias="isNew", serialization_alias="isNew")
    """Not cited in the equal-length window immediately before this one."""
    page_type: CitationUrlPageType = Field(
        ..., validation_alias="pageType", serialization_alias="pageType"
    )
    """What kind of page was cited."""
    prompt_count: int = Field(
        ..., validation_alias="promptCount", serialization_alias="promptCount"
    )
    title: str | None
    url: AnyUrl


class CitationUrlListTotals(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(populate_by_name=True)
    citations: int
    unique_domains: int = Field(
        ..., validation_alias="uniqueDomains", serialization_alias="uniqueDomains"
    )
    unique_urls: int = Field(
        ..., validation_alias="uniqueUrls", serialization_alias="uniqueUrls"
    )


class CitationUrlList(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    data: list[CitationUrl]
    """Every URL cited over the window, ordered by citation count."""
    range: DateRange
    totals: CitationUrlListTotals


class FanoutQuery(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    prompt_count: int = Field(
        ..., validation_alias="promptCount", serialization_alias="promptCount"
    )
    query: str
    """A search the engine ran while answering."""
    runs: int


class BrandQueryFanout(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    avg_queries_per_run: float = Field(
        ..., validation_alias="avgQueriesPerRun", serialization_alias="avgQueriesPerRun"
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    coverage_rate: float = Field(
        ...,
        ge=0,
        le=1,
        validation_alias="coverageRate",
        serialization_alias="coverageRate",
    )
    """Share of fan-out query instances whose answer mentioned the brand. Ratio 0–1; multiply by 100 for a percentage."""
    data: list[FanoutQuery]
    """Every distinct sub-query over the window, ordered by the runs that ran it."""
    fanout_runs: int = Field(
        ..., validation_alias="fanoutRuns", serialization_alias="fanoutRuns"
    )
    """Runs that searched at all. Engines that don't expose their searches contribute runs but no queries."""
    range: DateRange
    total_queries: int = Field(
        ..., validation_alias="totalQueries", serialization_alias="totalQueries"
    )
    total_runs: int = Field(
        ..., validation_alias="totalRuns", serialization_alias="totalRuns"
    )
    unique_queries: int = Field(
        ..., validation_alias="uniqueQueries", serialization_alias="uniqueQueries"
    )


class PromptPerformance(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_mention_rate: float = Field(
        ...,
        ge=0,
        le=1,
        validation_alias="brandMentionRate",
        serialization_alias="brandMentionRate",
    )
    """Share of this prompt's runs mentioning the brand. Ratio 0–1; multiply by 100 for a percentage."""
    competitor_mention_rate: float = Field(
        ...,
        ge=0,
        le=1,
        validation_alias="competitorMentionRate",
        serialization_alias="competitorMentionRate",
    )
    """Share of this prompt's runs mentioning any tracked competitor. Ratio 0–1; multiply by 100 for a percentage."""
    first_evaluated_at: datetime | None = Field(
        ..., validation_alias="firstEvaluatedAt", serialization_alias="firstEvaluatedAt"
    )
    last_run_at: datetime | None = Field(
        ..., validation_alias="lastRunAt", serialization_alias="lastRunAt"
    )
    prompt_id: UUID = Field(
        ..., validation_alias="promptId", serialization_alias="promptId"
    )
    tags: list[str]
    total_runs: int = Field(
        ..., validation_alias="totalRuns", serialization_alias="totalRuns"
    )
    value: str


class PromptPerformanceList(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    data: list[PromptPerformance]
    """Every prompt sampled over the window, with its results."""
    range: DateRange


class ModelVisibility(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_mentions: int = Field(
        ..., validation_alias="brandMentions", serialization_alias="brandMentions"
    )
    citations: int
    label: str
    model: str
    runs: int
    visibility: float | None
    """Share of this model's runs that mentioned the brand. Ratio 0–1; multiply by 100 for a percentage."""


class BrandAnalyticsShareOfVoice(BaseModel):
    """The brand against its tracked competitors."""

    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    brand: float | None
    """The brand's own share at the end of the window. Ratio 0–1; multiply by 100 for a percentage."""
    entries: list[ShareOfVoiceEntry]
    """Leaderboard, highest share first."""
    series: list[ShareOfVoicePoint]
    """The brand's share over time."""


class BrandAnalyticsTotals(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    citations: int
    prompts: int
    """Enabled prompts counted in the window."""
    runs: int
    unique_domains: int = Field(
        ..., validation_alias="uniqueDomains", serialization_alias="uniqueDomains"
    )
    unique_urls: int = Field(
        ..., validation_alias="uniqueUrls", serialization_alias="uniqueUrls"
    )


class BrandAnalyticsVisibility(BaseModel):
    """How often the brand is mentioned at all."""

    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    current: float | None
    """The last plotted point — the number the dashboard hero shows. Ratio 0–1; multiply by 100 for a percentage."""
    series: list[VisibilityPoint]


class BrandAnalytics(BaseModel):
    """Every non-paginated figure for a brand over one window. There is no parameter for selecting a subset: the four computations behind this share one scope resolution and run concurrently, so a subset would save a caller a fraction of one request and cost everyone a parameter to reason about."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    brand_name: str = Field(
        ..., validation_alias="brandName", serialization_alias="brandName"
    )
    models: list[ModelVisibility]
    """Per-model visibility and run counts. Only models that produced a run in the window appear."""
    range: DateRange
    share_of_voice: BrandAnalyticsShareOfVoice = Field(
        ..., validation_alias="shareOfVoice", serialization_alias="shareOfVoice"
    )
    """The brand against its tracked competitors."""
    totals: BrandAnalyticsTotals
    visibility: BrandAnalyticsVisibility
    """How often the brand is mentioned at all."""


GetBrandAnalyticsResponse = BrandAnalytics
"""Get a brand's analytics"""


ListBrandCitationDomainsResponse = CitationDomainList
"""List cited domains"""


ListBrandCitationUrlsResponse = CitationUrlList
"""List cited URLs"""


ListBrandPromptPerformanceResponse = PromptPerformanceList
"""List prompt performance"""


GetBrandQueryFanoutResponse = BrandQueryFanout
"""Get query fan-out"""
