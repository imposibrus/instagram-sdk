
const gulp = require('gulp'),
    babel = require('gulp-babel');

gulp.task('compile', () => {
    return gulp.src(['src/**/*.js'])
        .pipe(babel())
        .pipe(gulp.dest('dst'))
        // eslint-disable-next-line no-console
        .on('error', console.error);
});

gulp.task('watch', () => {
    return gulp.watch('src/**/*.js', ['compile']);
});

gulp.task('default', ['compile', 'watch']);
