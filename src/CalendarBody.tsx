import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import * as React from 'react'
import {
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native'
import { CalendarEvent } from './CalendarEvent'
import { commonStyles } from './commonStyles'
import { EventCellStyle, HorizontalDirection, ICalendarEvent } from './interfaces'
import {
  formatHour,
  getCountOfEventsAtEvent,
  getOrderOfEvent,
  getRelativeTopInDay,
  hours,
  isToday,
  typedMemo,
} from './utils'

dayjs.extend(isBetween)
const SWIPE_THRESHOLD = 50

const styles = StyleSheet.create({
  body: {
    flexDirection: 'row',
    flex: 1,
  },
  bodyRTL: {
    flexDirection: 'row-reverse',
    flex: 1,
  },
  nowIndicator: {
    position: 'absolute',
    zIndex: 10000,
    backgroundColor: 'red',
    height: 2,
    width: '100%',
  },
  dayContainer: {
    flex: 1,
    overflow: 'hidden',
  },
})

interface CalendarBodyProps<T> {
  cellHeight: number
  containerHeight: number
  dateRange: dayjs.Dayjs[]
  events: ICalendarEvent<T>[]
  scrollOffsetMinutes: number
  ampm: boolean
  showTime: boolean
  style: ViewStyle
  eventCellStyle?: EventCellStyle<T>
  hideNowIndicator?: boolean
  overlapOffset?: number
  isRTL: boolean
  onPressCell?: (date: Date) => void
  onPressEvent?: (event: ICalendarEvent<T>) => void
  onSwipeHorizontal?: (d: HorizontalDirection) => void
}

interface WithCellHeight {
  cellHeight: number
}

const HourGuideColumn = React.memo(
  ({ cellHeight, hour, ampm }: WithCellHeight & { hour: number; ampm: boolean }) => (
    <View style={{ height: cellHeight }}>
      <Text style={commonStyles.guideText}>{formatHour(hour, ampm)}</Text>
    </View>
  ),
  () => true,
)

interface HourCellProps extends WithCellHeight {
  onPress: (d: dayjs.Dayjs) => void
  date: dayjs.Dayjs
  hour: number
}

const HourCell = ({ cellHeight, onPress, date, hour }: HourCellProps) => {
  return (
    <TouchableWithoutFeedback onPress={() => onPress(date.hour(hour).minute(0))}>
      <View style={[commonStyles.dateCell, { height: cellHeight }]} />
    </TouchableWithoutFeedback>
  )
}

function _CalendarBody<T>({
  containerHeight,
  cellHeight,
  dateRange,
  style = {},
  onPressCell,
  events,
  onPressEvent,
  eventCellStyle,
  ampm,
  showTime,
  scrollOffsetMinutes,
  onSwipeHorizontal,
  hideNowIndicator,
  overlapOffset,
  isRTL,
}: CalendarBodyProps<T>) {
  const scrollView = React.useRef<ScrollView>(null)
  const [now, setNow] = React.useState(dayjs())
  const [panHandled, setPanHandled] = React.useState(false)

  React.useEffect(() => {
    if (scrollView.current && scrollOffsetMinutes && Platform.OS !== 'ios') {
      // We add delay here to work correct on React Native
      // see: https://stackoverflow.com/questions/33208477/react-native-android-scrollview-scrollto-not-working
      setTimeout(
        () => {
          if (scrollView && scrollView.current) {
            scrollView.current.scrollTo({
              y: (cellHeight * scrollOffsetMinutes) / 60,
              animated: false,
            })
          }
        },
        Platform.OS === 'web' ? 0 : 10,
      )
    }
  }, [scrollView])

  React.useEffect(() => {
    if (hideNowIndicator) {
      return () => {}
    }
    const pid = setInterval(() => setNow(dayjs()), 2 * 60 * 1000)
    return () => clearInterval(pid)
  }, [])

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        // see https://stackoverflow.com/questions/47568850/touchableopacity-with-parent-panresponder
        onMoveShouldSetPanResponder: (_, { dx, dy }) => {
          return dx > 2 || dx < -2 || dy > 2 || dy < -2
        },
        onPanResponderMove: (_, { dy, dx }) => {
          if (dy < -1 * SWIPE_THRESHOLD || SWIPE_THRESHOLD < dy || panHandled) {
            return
          }
          if (dx < -1 * SWIPE_THRESHOLD) {
            onSwipeHorizontal && onSwipeHorizontal('LEFT')
            setPanHandled(true)
            return
          }
          if (dx > SWIPE_THRESHOLD) {
            onSwipeHorizontal && onSwipeHorizontal('RIGHT')
            setPanHandled(true)
            return
          }
        },
        onPanResponderEnd: () => {
          setPanHandled(false)
        },
      }),
    [panHandled, onSwipeHorizontal],
  )

  const _onPressCell = React.useCallback(
    (date: dayjs.Dayjs) => {
      onPressCell && onPressCell(date.toDate())
    },
    [onPressCell],
  )

  return (
    <ScrollView
      style={[
        {
          height: containerHeight - cellHeight * 3,
        },
        style,
      ]}
      ref={scrollView}
      scrollEventThrottle={32}
      {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      contentOffset={Platform.OS === 'ios' ? { x: 0, y: scrollOffsetMinutes } : { x: 0, y: 0 }}
    >
      <View
        style={isRTL ? [styles.bodyRTL] : [styles.body]}
        {...(Platform.OS === 'web' ? panResponder.panHandlers : {})}
      >
        <View style={[commonStyles.hourGuide]}>
          {hours.map((hour) => (
            <HourGuideColumn key={hour} cellHeight={cellHeight} hour={hour} ampm={ampm} />
          ))}
        </View>
        {dateRange.map((date) => (
          <View style={styles.dayContainer} key={date.toString()}>
            {hours.map((hour) => (
              <HourCell
                key={hour}
                cellHeight={cellHeight}
                date={date}
                hour={hour}
                onPress={_onPressCell}
              />
            ))}
            {events
              .filter(({ start }) =>
                dayjs(start).isBetween(date.startOf('day'), date.endOf('day'), null, '[)'),
              )
              .map((event) => (
                <CalendarEvent
                  key={`${event.start}${event.title}`}
                  event={event}
                  onPressEvent={onPressEvent}
                  eventCellStyle={eventCellStyle}
                  showTime={showTime}
                  eventCount={getCountOfEventsAtEvent(event, events)}
                  eventOrder={getOrderOfEvent(event, events)}
                  overlapOffset={overlapOffset}
                />
              ))}
            {isToday(date) && !hideNowIndicator && (
              <View style={[styles.nowIndicator, { top: `${getRelativeTopInDay(now)}%` }]} />
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

export const CalendarBody = typedMemo(_CalendarBody)
