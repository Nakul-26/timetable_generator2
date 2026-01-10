# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Timetable Generation Constraints

The timetable generation process adheres to a set of rules and constraints to create a valid and optimized schedule. These are extracted from the core generator logic.

### Hard Constraints

These are strict rules that the generator must follow. A violation of any of these constraints will make a timetable invalid.

*   **Subject Hours:** A class cannot be assigned more hours for a subject than specified in its requirements.
*   **Class Availability:** A class cannot have two subjects assigned to the same time slot.
*   **Teacher Availability:** A teacher cannot teach two different classes at the same time.
*   **Teacher's Daily Load:** A teacher must teach exactly 4 hours per day - ifreally needed can you relaxed.
*   **Continuous Teaching:** A teacher cannot teach for more than 2 continuous hours.
*   **Lab Blocks:** Lab subjects must be taught in blocks of 2 continuous hours.
*   **Combined Classes:** For combined classes, the assigned time slot must be available for all classes in the combination.
*   **Fixed Slots:** Pre-assigned "fixed slots" for certain classes/subjects must be respected.
*   **Elective classes:** some classes have elective subjects - elective subjects have more than 1 teacher assigned.

### Soft Constraints

These are preferences that the generator tries to optimize for, to create a better quality timetable.

*   **No Gaps:** The generator tries to minimize gaps in a class's daily schedule.

### Other Rules & Configurations

*   **Schedule Grid:** The default schedule is 6 days a week and 8 hours a day.
*   **Break Hours:** Specific hours in the day can be configured as break times.
<!-- *   **Teacher Daily Hours (New Rule):** A new rule mentioned in the generator's comments is that a teacher's daily teaching hours must be either 0 or exactly 4. The implementation of this as a hard or soft constraint is not clear from the code. -->