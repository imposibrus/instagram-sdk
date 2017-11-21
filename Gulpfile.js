
const gulp = require('gulp'),
    typescript = require('gulp-typescript'),
    merge = require('merge2'),
    tsProject = typescript.createProject('src/tsconfig.json');

gulp.task('compile', () => {
    const tsResult = gulp.src(['src/**/*.{ts,js}', 'definitions/**.ts'])
        .pipe(tsProject());

    return merge([
        tsResult.js.pipe(gulp.dest('dst')),
        tsResult.dts.pipe(gulp.dest('dst')),
    ]);
});

gulp.task('watch', () => {
    return gulp.watch('src/**/*.{ts,js}', ['compile']);
});

gulp.task('default', ['compile', 'watch']);
