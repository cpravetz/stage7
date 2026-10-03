# Crowd Safety and Occupancy Standards for Live Events

Crowd safety is the discipline of keeping everyone in a room safe under normal conditions, under stress, and under evacuation — and of being able to prove afterwards that the plan existed and was followed. This handbook covers the planning thresholds, the incident taxonomy and the communication rules that the event operations workflow applies, framed the way a practitioner handbook frames them: as defaults to be checked against local regulation, venue capacity certificates, and the judgement of a qualified safety professional. Nothing here overrides a fire code, a building certificate or an authority having jurisdiction.

## Scope and governing authority

Safety obligations run in a fixed order of precedence:

1. **Local regulation and the building's own occupancy certificate.** These set hard maximums for occupancy, egress width, and assembly use.
2. **The venue's operating rules and the venue's emergency action plan.** These sit inside the certificate limits and are usually stricter.
3. **The event's own safety plan**, which must be at least as strict as 1 and 2 combined.
4. **Vendor and contractor rules**, which may only be stricter.

Never plan to a "commonly cited" figure where a certificate states a number. This document's figures are planning defaults used to size staffing, barriers and medical cover when no certificate is to hand.

## Occupancy and capacity planning

Occupancy is not one number. It differs by space, by event configuration, and by whether the space is equipped for assembly, tables-and-chairs, or standing reception.

- **Issued maximum occupancy.** From the venue certificate or the fire code. This is a legal ceiling. Plan below it, not to it.
- **Planned capacity.** What the layout actually supports, after accounting for stages, bars, buffet queues, VIP platforms and equipment rooms. Usually 5–15% below the issued figure.
- **Comfort capacity.** The point at which service degrades: queues exceed a few minutes, exits become a pinch point, and guests stop circulating. Frequently cited operational targets sit well below legal limits.

**Comfort and service density** is the number most useful for day-of decisions:

```
serviceDensity = guestsPresent / usableFloorAreaSqFt
circulationCapacity = widthOfExitRouteFt × flowRatePerFtPerMin
queueTimeMinutes = arrivingGuestsPerMinute / servicePoints / avgServiceTimeMinutes
```

Commonly cited planning densities, to be confirmed against local code and the venue certificate:

| Configuration | Commonly cited planning density | Planning note |
| --- | --- | --- |
| Standing reception | 2–3 guests per 10 sq ft | Lower end for buffets and multiple bars |
| Standing with seated zones | 1.5–2 per 10 sq ft | Mixed layouts read as tighter than pure standing |
| Seated banquet, rounds | ~15–20 sq ft per guest | Includes circulation and service aisles |
| Seated banquet, long tables | ~10–15 sq ft per guest | Denser but weaker sight lines |
| Theatre / keynote only | ~2–3 sq ft per guest | Rows plus clear circulation |
| Queuing zone | ~2–3 sq ft per queued guest | Design the queue or it will occupy the lobby |

Note the unit convention: most of these are quoted as guests per 10 sq ft or sq ft per guest. Write one into the plan and use it consistently; mixing conventions is how density checks silently pass.

## Ingress, queuing and flow

Most crowd problems happen in the twenty minutes before doors and the ten minutes after the last item, not during the main programme.

- **Queue design.** Queues must be railed or marshalled into defined lanes, never form spontaneously across a fire door, an exit or a service route.
- **Check-in throughput is a capacity number.** With multiple check-in points, arrival rate above aggregate throughput produces a growing lobby queue regardless of room capacity.

```
checkInPointsRequired = ceil(arrivalsInPeakWindow / (points × guestsPerPointPerHour / 60))
lobbyClearanceRate    = checkInPoints × throughputPerPoint
```

- **Access separation.** Separate the guest entrance, the staff entrance, and the performer/load-in route. Mixed routes during arrival are a common crush cause.
- **Bag policy and screening** increase ingress time materially. Model it before promising an arrival time.

## Egress and emergency evacuation

- Every route on the floor plan is an egress route, including routes staff use as shortcuts.
- Exit widths, travel distances and the number of exits come from the code; the plan only records and honours them.
- **Do not count a door that is propped, blocked by equipment, or held by a check-in desk** as available egress.
- Furniture layouts must be physically compatible with the evacuation plan. A dance floor laid over a taped evacuation route invalidates it.
- The assembly area must be outside the building's footprint, reachable by the routes named, and large enough for the planned attendance. Assembly area capacity is a frequently missed constraint.
- **Evacuation vs. shelter-in-place** is a decision made by named individuals under a written trigger list. Write the triggers down: which condition triggers which response, and who is authorised to call it.
- Accessible egress, including refuge areas and evacuation chairs, is planned and staffed with the rest of the egress, not added afterwards.

## Accessibility

- Step-free route from public transport and parking to the seating area, and step-free stage access if the programme requires it.
- Accessible seating distribution, with companion seats, and a seating plan that does not strand wheelchair users in the last row.
- Accessible restrooms identified and signed on the floor plan.
- Accessible routes maintained for evacuation, staffed by named marshals.
- Captioning, assistive listening and a hearing loop where the programme format requires it.
- Registration flow that allows a guest to request access needs without disclosing a diagnosis to general staff.

## Fire and life safety

- **Assembly occupancy permit** where required, obtained before doors, not on the day.
- Fire marshal inspection scheduled and completed before guest arrival.
- Extinguishers and their locations marked on the floor plan; type and placement per local code.
- Flame-retardant treatment and certification for drapes, banners, scrim and décor textiles — this is a documents-to-collect list, not a promise.
- No blocking of fire doors, exit signage, fire equipment, or electrical panels.
- Pyrotechnics, open flame, cold sparks and fuel are specialist work with separate permits, licensed operators and insurance. Treat them as a separate project with its own approval chain, or decline.
- Cable runs taped or ramped; generators outside public areas with fuel handling and fire watch as required.

## Alcohol and regulated service

Alcohol service is where safety, law and liability intersect hardest.

- **Licensed only, and only within licensed hours.** Licensing status, capacity and permitted hours are venue and jurisdiction specific; verify them rather than assuming.
- **Age verification policy**, applied consistently at every entry point, with a documented process for refusing entry.
- **Server training** where the jurisdiction requires it, with records retained.
- **Refusal of service to any person** is an expected operational action, not an exception. Staff must be able to refuse without manager escalation every time.
- **Intoxication indicators and intervention script.** Managers need an agreed, brief, non-judgemental script.
- **Last call and closing protocol**, coordinated with the bar lead and the planner, and with transport information made available to guests.
- **Drink refusal and refusal logging.** A logged refusal is evidence of a policy working.
- **Impaired departure policy.** Staff are explicitly not driving guests, arguing with them, or physically intervening beyond what their training authorises.

## Medical and first aid

- **First aid provision scales with attendance and event type.** A commonly cited planning floor is one qualified first-aider per 100–150 guests for seated events, higher for standing, active or alcohol-served events. This is a starting point for planning, not a standard.
- Qualified first aiders with visible identifiers, a stocked kit, and a treatment room for larger events.
- Emergency contact path: from any position in the room to the first aider to emergency services, with the address given to the dispatcher in the venue's own naming.
- **AED location** confirmed with the venue and checked before doors.
- Ambulance access route kept clear, including the stretch between the loading dock and the room.
- Known medical conditions, emergency contacts and consent status for staff, held confidentially and accessible only to designated personnel.

## Severe weather and shelter in place

- Forecast monitoring assigned to a named role, with a decision time written into the run of show.
- Shelter-in-place vs. evacuation decision rights, and the trigger conditions for each.
- Shelter areas identified on the floor plan with a headcount method that can actually be executed quickly.
- Outdoor elements: wind ratings for inflatables, tents, signage and staging; a wind threshold for taking them down, and someone authorised to do it.
- Heat mitigation: water, shade, cooling points, and signage thresholds for an indoor event with a large standing crowd.

## Incident command and communications

The day-of operations tool carries incidents as `issueData` with `type`, `severity`, `location`, `description` and `assignedTo`, and broadcasts as `alertData` with `message`, `channels`, `recipients` and `urgency`. Use them consistently, because the incident log is the record that a safety system existed.

Severity ladder used for logging and escalation:

| Severity | Meaning | Response | Escalation |
| --- | --- | --- | --- |
| `critical` | Immediate threat to life or building: fire, structural, medical emergency, crowd crush indicator, violence | Stop the affected activity, clear the area, call emergency services, notify event lead | Immediate, by radio or configured channel, to event lead and venue |
| `high` | Significant risk or repeated minor issue: blocked exit, capacity breach, power failure, alcohol-related injury | Assign an owner, mitigate immediately, log | Event lead within minutes |
| `medium` | Disruption with no injury risk: AV failure, queue backing into a restricted area, staffing shortfall | Assign an owner, work it | Logged, reviewed at run-of-show check |
| `low` | Housekeeping or comfort: signage, seating, temperature | Queue to the floor team | Logged, reviewed post-event |

Communication channels configured for the operations platform are `slack`, `teams`, `sms`, `radio` and `app-push`. Use the most durable channel for the most urgent message: radio or SMS for critical, chat or push for informational. A broadcast to 2,000 guests should be short, plain, and issued once rather than reworded three times.

Every incident log entry should carry: what happened, when, where in the room, who was involved, what was done, and what evidence exists (photo, radio log, medical note). An incident with no location cannot be analysed and will recur.

## Check-in and identity handling

Check-in methods available to the operations workflow are `qr-code`, `badge-scan`, `manual`, `facial-recognition` and `rfid`.

- **Qr-code and badge-scan** are the defaults and carry the least risk.
- **Manual** check-in needs a written identity-confirmation procedure and a record of who was admitted.
- **Facial recognition** is legally restricted in some jurisdictions and carries significant consent, retention and bias obligations. Do not enable it without documented legal clearance, an explicit lawful basis, a retention limit and a published notice to attendees. Treat it as a separate approval project.
- **RFID** raises its own privacy and security questions and is usually only justified for cashless or movement analytics.
- Check-in data is personal data. Collect the minimum, retain for the shortest defensible period, and have a deletion path.

## Vendor and contractor compliance

Before any contractor works on site, collect:

- Certificate of insurance with the venue named as additional insured, limits as agreed in the contract.
- Licences and certifications for the work being performed: electrical, rigging, pyrotechnics, medical, alcohol service, driving.
- Method statement or safety plan for anything above head height, over public areas, or involving power.
- Trained-personnel evidence and, where relevant, the operator's own incident history.
- Insurance expiry tracking. A certificate expiring mid-event is a live problem, not a filing detail.

## Pre-event safety checklist

Run this before every doors-open, and record who ran it:

- Posted occupancy matches the floor plan and the current layout; layout changes since sign-off trigger a re-check.
- All exits unlocked, unblocked, unmarked-by-equipment, and clear of queued guests.
- Fire doors closed or approved open; emergency lighting functional.
- Extinguishers in place and accessible; AED present and checked.
- Barriers and queue rails positioned per plan; no improvised extension.
- Stage, truss, generators and cable ramps inspected and signed off.
- First aiders on post with kits and radio check completed; treatment room open.
- Emergency services notified of the event if the venue requires it; access route clear.
- Radio check with all leads; escalation tree confirmed by voice, not assumed.
- Event lead and venue duty manager physically identified to each other.
- Weather decision made or timed; shelter and evacuation routes briefed to all leads.
- Staff briefed on prohibited items, refusal-of-service policy and incident logging.

## After the event

Close the loop: reconcile the incident log against the venue's report, file the certificates and permits, review near-misses separately from incidents, and feed what changed back into the next event's plan. Safety plans that are not revised after an event were not really plans.

## Configuring this

Every density, ratio, cut-off and severity threshold here is a planning default that the operator overrides — legal requirements and the venue's occupancy certificate always take precedence over anything in this document. Occupancy limits, ingress throughput expectations, the enabled `checkInMethods`, seating and layout settings, and the `communicationChannels` used for broadcasts are configured on the Day-of Operations skill for the specific venue, and incidents are logged through its `issueData` and `alertData` inputs with the severity ladder above. Any change to floor layout, guest count or programme should be re-checked against the venue before it is confirmed.