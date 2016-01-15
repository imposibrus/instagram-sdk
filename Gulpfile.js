
var gulp = require('gulp'),
    babel = require('gulp-babel');

gulp.task('compile', function() {
  return gulp.src(['src/index.js', 'src/constants.js'])
      .pipe(babel())
      .pipe(gulp.dest('dst'))
      .on('error', console.error);
});

gulp.task('watch', function() {
  return gulp.watch('src/**/*.js', ['compile']);
});

gulp.task('default', ['compile', 'watch']);
