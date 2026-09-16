# Timetable Management System 

This is our last project UI design for Timetable Management System.For the timetable generator,we use TIMETABLE SLOT RULES



Available Days:



* Monday

* Tuesday

* Wednesday

* Thursday

* Friday



Available Time Slots:



Morning:



* 9:00 AM - 10:00 AM

* 10:00 AM - 11:00 AM

* 11:00 AM - 12:00 PM



Lunch Break:



* 12:00 PM - 1:00 PM



Afternoon:



* 1:00 PM - 2:00 PM

* 2:00 PM - 3:00 PM

* 3:00 PM - 4:00 PM



SUBJECT DURATION RULES



Subjects can only have:



1. One-hour duration

   Examples:



* 9:00 AM - 10:00 AM

* 10:00 AM - 11:00 AM

* 1:00 PM - 2:00 PM



2. Two-hour consecutive duration

   Examples:



* 9:00 AM - 11:00 AM

* 10:00 AM - 12:00 PM

* 1:00 PM - 3:00 PM

* 2:00 PM - 4:00 PM



The system must never assign a two-hour subject to non-consecutive time slots.



Invalid Example:



* 9:00 AM - 10:00 AM

* 11:00 AM - 12:00 PM



Valid Example:



* 9:00 AM - 10:00 AM

* 10:00 AM - 11:00 AM



TIMETABLE GENERATION CONSTRAINTS



The scheduling engine must ensure:



1. No student timetable conflicts.

2. No lecturer timetable conflicts.

3. No room timetable conflicts.

4. Two-hour subjects occupy consecutive slots only.

5. Students may take subjects from different years.

6. Re-attendance (retake) subjects must be considered during scheduling.

7. Room capacity must satisfy enrolled student count.

8. Schedule subjects with larger enrollment first.

9. Generate the timetable based on actual student registrations, not academic year alone.



The timetable generator should use Graph Coloring, Constraint Satisfaction Problem (CSP),

 and Greedy Optimization algorithms to produce a conflict-free timetable.

Please make able to add real data instead of test data to run smoothly


## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
