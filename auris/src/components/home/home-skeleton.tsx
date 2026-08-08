"use client";

export function HomeHeroSkeleton() {
  return (
    <section className="desktop-dashboard__hero desktop-page-panel skeleton-loading">
      <div className="desktop-dashboard__hero-copy">
        <div className="skeleton skeleton--text skeleton--eyebrow" />
        <div className="skeleton skeleton--text skeleton--heading" />
        <div className="skeleton skeleton--text skeleton--paragraph" />
      </div>
      <div className="desktop-dashboard__hero-actions">
        <div className="skeleton skeleton--button skeleton--primary" />
        <div className="skeleton skeleton--button skeleton--secondary" />
        <div className="skeleton skeleton--button skeleton--secondary" />
        <div className="skeleton skeleton--button skeleton--secondary" />
      </div>
      <div className="desktop-dashboard__status-strip">
        {[1, 2, 3].map((i) => (
          <div className="desktop-dashboard__status-card" key={i}>
            <div className="skeleton skeleton--text skeleton--label" />
            <div className="skeleton skeleton--text skeleton--value" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function QuickActionsCardSkeleton() {
  return (
    <div className="quick-actions-card skeleton-loading">
      <div className="skeleton skeleton--icon" />
      <div className="skeleton skeleton--text skeleton--title" />
      <div className="skeleton skeleton--text skeleton--description" />
    </div>
  );
}

export function QuickActionsSkeleton() {
  return (
    <section className="desktop-dashboard__quick-actions desktop-page-panel">
      <div className="skeleton skeleton--text skeleton--section-title" />
      <div className="quick-actions-grid">
        {[1, 2, 3, 4].map((i) => (
          <QuickActionsCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function ActivityTimelineSkeleton() {
  return (
    <section className="desktop-dashboard__timeline desktop-page-panel">
      <div className="skeleton skeleton--text skeleton--section-title" />
      <div className="timeline-list">
        {[1, 2, 3].map((i) => (
          <div className="timeline-item" key={i}>
            <div className="skeleton skeleton--circle" />
            <div className="timeline-item__content">
              <div className="skeleton skeleton--text skeleton--title" />
              <div className="skeleton skeleton--text skeleton--description" />
              <div className="skeleton skeleton--text skeleton--time" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ContentTabsSkeleton() {
  return (
    <section className="desktop-dashboard__content-tabs desktop-page-panel skeleton-loading">
      <div className="content-tabs__header">
        <div className="skeleton skeleton--text skeleton--section-title" />
        <div className="content-tabs__nav">
          {[1, 2, 3].map((i) => (
            <div className="skeleton skeleton--tab" key={i} />
          ))}
        </div>
      </div>
      <div className="desktop-dashboard__card-row">
        {[1, 2, 3, 4].map((i) => (
          <div className="showcase-card-skeleton" key={i}>
            <div className="skeleton skeleton--image" />
            <div className="skeleton skeleton--text skeleton--title" />
            <div className="skeleton skeleton--text skeleton--description" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeDashboardSkeleton() {
  return (
    <main className="desktop-home-shell desktop-dashboard">
      <HomeHeroSkeleton />
      <QuickActionsSkeleton />
      <ActivityTimelineSkeleton />
      <ContentTabsSkeleton />
    </main>
  );
}
