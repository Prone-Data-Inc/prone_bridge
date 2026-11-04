/* One course: what it is, its outline, and a card to buy it. Once bought, the outline opens up. */
import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle, Lock, PlayCircle, WarningCircle } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import { capitalize, usd } from '@/lib/format.js'
import { productBySlug, useCatalog } from '@/stores/catalog.js'
import { useLearner } from '@/stores/learner.js'
import { hashFor, useNav } from '@/stores/nav.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import Modal from '@/ui/Modal.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import CourseCover from './CourseCover.jsx'
import PdlFrame from './PdlFrame.jsx'
import { curriculumFor } from './curriculum.js'
import p from './Pdl.module.css'
import s from './CourseDetail.module.css'

const PERKS = ['Pay once, yours forever', 'Learn at your own pace', 'Pay in your own currency']

export default function CourseDetail({ param: slug }) {
  const { status, products, ensure, reload } = useCatalog()
  const courses = useLearner((state) => state.courses)
  const go = useNav((state) => state.go)
  const [lesson, setLesson] = useState(null)

  useEffect(() => {
    ensure()
  }, [ensure])

  const product = productBySlug(products, slug)
  const owned = product ? courses.some((course) => course.id === product.id) : false

  if (status === 'error' || (status === 'ready' && !product)) {
    return (
      <PdlFrame>
        <div className={cx(p.container, s.missing)}>
          <EmptyState
            icon={WarningCircle}
            title={status === 'error' ? 'We could not load this course' : 'We could not find that course'}
            action={
              <Button onClick={status === 'error' ? reload : () => go('buyer', 'home')}>
                {status === 'error' ? 'Try again' : 'Back to courses'}
              </Button>
            }
          >
            {status === 'error' ? 'Check your connection and try again.' : 'It may have been removed.'}
          </EmptyState>
        </div>
      </PdlFrame>
    )
  }

  if (!product) {
    return (
      <PdlFrame>
        <div className={cx(p.container, s.layout)}>
          <Skeleton height={420} radius={16} />
          <Skeleton height={280} radius={16} />
        </div>
      </PdlFrame>
    )
  }

  const modules = curriculumFor(product)

  return (
    <PdlFrame>
      <div className={cx(p.container, s.layout)}>
        <div className={s.main}>
          <a className={s.back} href={hashFor('buyer', 'home')}>
            <ArrowLeft size={16} aria-hidden />
            All courses
          </a>
          <CourseCover product={product} size="hero" />
          <header className={s.header}>
            <p className={s.tag}>{product.category === 'ai' ? 'AI' : capitalize(product.category)}</p>
            <h1 className={s.title}>{product.title}</h1>
            <p className={s.subtitle}>{product.subtitle}</p>
          </header>
          <p className={s.summary}>{product.summary}</p>

          <section aria-labelledby="curriculum-title" className={s.curriculum}>
            <h2 id="curriculum-title" className={s.heading}>
              What you will learn
            </h2>
            <ol className={s.modules}>
              {modules.map((module, index) => {
                const open = owned || index === 0
                return (
                  <li key={module.id}>
                    <button
                      type="button"
                      className={s.module}
                      disabled={!open}
                      onClick={() => setLesson({ module, number: index + 1 })}
                    >
                      <span className={s.number}>{index + 1}</span>
                      <span className={s.moduleText}>
                        <span className={s.moduleTitle}>{module.title}</span>
                        <span className={s.moduleMeta}>
                          {module.lessons} {module.lessons === 1 ? 'lesson' : 'lessons'}
                        </span>
                      </span>
                      {index === 0 && !owned && <Badge tone="accent">Free preview</Badge>}
                      {owned ? (
                        <PlayCircle size={22} weight="fill" className={s.open} aria-label="Open" />
                      ) : index > 0 ? (
                        <Lock size={18} className={s.lock} aria-label="Locked" />
                      ) : (
                        <PlayCircle size={22} className={s.open} aria-label="Preview" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <aside className={s.card} aria-label="Buy this course">
          {owned ? (
            <>
              <Badge tone="success" dot>
                Unlocked
              </Badge>
              <p className={s.owned}>You own this course.</p>
              <Button
                variant="primary"
                size="lg"
                className={s.cta}
                onClick={() => setLesson({ module: modules[0], number: 1 })}
              >
                Start learning
              </Button>
              <Button className={s.cta} onClick={() => go('buyer', 'learn')}>
                My courses
              </Button>
            </>
          ) : (
            <>
              <p className={s.price}>{usd(product.priceUsdCents)}</p>
              <p className={s.priceNote}>One payment. Pay in your own currency at checkout.</p>
              <Button
                variant="primary"
                size="lg"
                className={s.cta}
                onClick={() => go('buyer', 'checkout', product.slug)}
              >
                Buy this course
              </Button>
              <ul className={s.perks}>
                {PERKS.map((perk) => (
                  <li key={perk}>
                    <CheckCircle size={18} weight="fill" aria-hidden />
                    {perk}
                  </li>
                ))}
              </ul>
            </>
          )}
          <dl className={s.facts}>
            <div>
              <dt>Lessons</dt>
              <dd>{product.lessons}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{product.hours} h</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{capitalize(product.level)}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <Modal
        open={Boolean(lesson)}
        onClose={() => setLesson(null)}
        title={lesson ? `${lesson.number}. ${lesson.module.title}` : ''}
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setLesson(null)}>
            Close
          </Button>
        }
      >
        This is a demo. The course videos are not part of it.
      </Modal>
    </PdlFrame>
  )
}
