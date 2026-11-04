/* The courses this buyer has unlocked. */
import { BookOpen } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import { courseFacts } from '@/lib/format.js'
import { hashFor, useNav } from '@/stores/nav.js'
import { useLearner } from '@/stores/learner.js'
import { useSession } from '@/stores/session.js'
import { Button } from '@/ui/Button.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import CourseCover from './CourseCover.jsx'
import PdlFrame from './PdlFrame.jsx'
import p from './Pdl.module.css'
import s from './MyCourses.module.css'

export default function MyCourses() {
  const { courses, loaded } = useLearner()
  const buyer = useSession((state) => state.buyer)
  const go = useNav((state) => state.go)

  return (
    <PdlFrame>
      <div className={cx(p.container, s.page)}>
        <header className={s.header}>
          <h1 className={s.title}>My courses</h1>
          <p className={s.subtitle}>{buyer ? `Unlocked by ${buyer.name}.` : 'Courses you buy show up here.'}</p>
        </header>

        {!loaded && <Skeleton height={96} radius={16} />}

        {loaded && courses.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title="Nothing here yet"
            action={
              <Button variant="primary" onClick={() => go('buyer', 'home')}>
                Browse courses
              </Button>
            }
          >
            Courses you buy show up here, ready to open.
          </EmptyState>
        )}

        {courses.length > 0 && (
          <ul className={s.list}>
            {courses.map((course) => (
              <li key={course.id} className={s.row}>
                <CourseCover product={course} size="small" />
                <div className={s.text}>
                  <a className={s.name} href={hashFor('buyer', 'course', course.slug)}>
                    {course.title}
                  </a>
                  <p className={s.facts}>{courseFacts(course)}</p>
                </div>
                <Button variant="primary" onClick={() => go('buyer', 'course', course.slug)}>
                  Continue
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PdlFrame>
  )
}
