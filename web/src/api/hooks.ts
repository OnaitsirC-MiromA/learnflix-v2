import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const useCourses = (archived?: boolean) => useQuery({ queryKey: ['courses', { archived: !!archived }], queryFn: () => api.listCourses(archived) });
export const useCourse = (id: string) => useQuery({ queryKey: ['course', id], queryFn: () => api.getCourse(id) });
export const useCollections = () => useQuery({ queryKey: ['collections'], queryFn: api.listCollections });
export const useCourseRoots = () => useQuery({ queryKey: ['courseRoots'], queryFn: api.listCourseRoots });

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.createCourse(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  });
}

export function useSetComplete(courseId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => api.setComplete(id, completed),
    onSuccess: () => {
      if (courseId) qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}
