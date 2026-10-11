// Starter data. Edit freely: departments and courses are only inserted when the tables are empty.
// Course codes/titles below are SAMPLES - replace them with your department's real course list.

const departments = [
  ['CSE', 'Computer Science & Engineering'],
  ['SWE', 'Software Engineering'],
  ['MCT', 'Multimedia & Creative Technology'],
  ['EEE', 'Electrical & Electronic Engineering'],
  ['ETE', 'Electronics & Telecommunication Engineering'],
  ['CE', 'Civil Engineering'],
  ['TE', 'Textile Engineering'],
  ['ARCH', 'Architecture'],
  ['BBA', 'Business Administration'],
  ['ENG', 'English'],
  ['LAW', 'Law'],
  ['PHARM', 'Pharmacy'],
  ['PH', 'Public Health'],
  ['NFE', 'Nutrition & Food Engineering'],
  ['JMC', 'Journalism, Media & Communication'],
  ['ESDM', 'Environmental Science & Disaster Management'],
  ['THM', 'Tourism & Hospitality Management'],
  ['GED', 'General Education (all departments)'],
];

// [department code, course code, course title]
const courses = [
  ['CSE', 'CSE111', 'Programming Fundamentals'],
  ['CSE', 'CSE112', 'Object Oriented Programming'],
  ['CSE', 'CSE121', 'Discrete Mathematics'],
  ['CSE', 'CSE122', 'Digital Logic Design'],
  ['CSE', 'CSE131', 'Data Structures'],
  ['CSE', 'CSE132', 'Algorithms'],
  ['CSE', 'CSE141', 'Database Management Systems'],
  ['CSE', 'CSE142', 'Operating Systems'],
  ['CSE', 'CSE151', 'Computer Networks'],
  ['CSE', 'CSE152', 'Software Engineering'],
  ['SWE', 'SWE111', 'Introduction to Software Engineering'],
  ['SWE', 'SWE121', 'Software Requirement Engineering'],
  ['EEE', 'EEE111', 'Basic Electrical Circuits'],
  ['EEE', 'EEE121', 'Electronic Devices & Circuits'],
  ['BBA', 'BBA101', 'Principles of Management'],
  ['BBA', 'BBA102', 'Principles of Accounting'],
  ['ENG', 'ENG101', 'Introduction to Literature'],
  ['LAW', 'LAW101', 'Legal System of Bangladesh'],
  ['GED', 'MAT101', 'Calculus'],
  ['GED', 'PHY101', 'Physics I'],
  ['GED', 'ENG111', 'English Composition'],
];

module.exports = { departments, courses };
